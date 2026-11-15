// Этот модуль реализует доменные операции цепочки и сохраняет её переходы между состояниями.
import { randomBytes, randomUUID, timingSafeEqual, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  ACTIVE_CHAIN_CAP,
  CHAIN_TARGET_HOPS,
  CLAIM_TTL_SECONDS,
  type Language,
} from "../../packages/shared/constants";
import { canonicalText, isDuplicateText, sha256Text, validateText } from "../../packages/shared/validation/text";
import {
  type Chain,
  type Claim,
  type GalleryChain,
  type Message,
  type RecoverResult,
  type ReportReason,
  type ReportResult,
  type PublicStats,
  type PublicMapStats,
  type MaintenanceResult,
  RelayError,
  type StartResult,
  type SubmitResult,
} from "../../packages/shared/types/relay";
import { decryptToken, encryptToken, tokenHash } from "../crypto/token";
import { withTransaction } from "../db/pool";
import type { AdminChainDetail, AdminChainSummary, AdminReport, AdminTheme } from "./in-memory";

type Row = Record<string, unknown>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function uuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function publicCode(): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from(randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join("");
}

function countryOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = value.toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized) || normalized === "AA" || normalized === "ZZ") {
    throw new RelayError("INVALID_COUNTRY_CODE");
  }
  return normalized;
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function chainFromRow(row: Row): Chain {
  return {
    id: String(row.id),
    publicCode: String(row.public_code).trim(),
    themeId: String(row.theme_id),
    themeTitleSnapshot: String(row.theme_title_snapshot),
    seedTextSnapshot: String(row.seed_text_snapshot),
    language: row.language as Language,
    targetHops: Number(row.target_hops) as 12,
    currentHop: Number(row.current_hop),
    status: row.status as Chain["status"],
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    completedAt: row.completed_at ? new Date(String(row.completed_at)) : null,
    lastActivityAt: new Date(String(row.last_activity_at)),
  };
}

function claimFromRow(row: Row): Claim {
  return {
    id: String(row.id),
    chainId: String(row.chain_id),
    hopIndex: Number(row.hop_index),
    sessionHash: String(row.session_hash),
    claimTokenHash: String(row.claim_token_hash),
    testOnlyToken: "",
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    submittedMessageId: row.submitted_message_id ? String(row.submitted_message_id) : null,
    submittedTextHash: row.submitted_text_hash ? String(row.submitted_text_hash) : null,
    submittedCountryCode: row.submitted_country_code ? String(row.submitted_country_code).trim() : null,
    status: row.status as Claim["status"],
    claimedAt: new Date(String(row.claimed_at)),
    expiresAt: new Date(String(row.expires_at)),
    submittedAt: row.submitted_at ? new Date(String(row.submitted_at)) : null,
  };
}

function messageFromRow(row: Row): Message {
  return {
    id: String(row.id),
    chainId: String(row.chain_id),
    hopIndex: Number(row.hop_index),
    parentId: row.parent_id ? String(row.parent_id) : null,
    text: String(row.text),
    wordCount: Number(row.word_count),
    textHash: String(row.text_hash),
    sessionHash: String(row.session_hash),
    moderationStatus: row.moderation_status as Message["moderationStatus"],
    createdAt: new Date(String(row.created_at)),
  };
}

export class PostgresRelay {
  async start(
    language: Language,
    sessionHash: string,
    idempotencyKey: string,
    requestedCode?: string | null,
    excludedPublicCode?: string | null,
  ): Promise<StartResult> {
    if (!uuidV4(idempotencyKey)) throw new RelayError("INVALID_IDEMPOTENCY_KEY");
    const requestHash = sha256(language + "\0" + (requestedCode ?? "") + (excludedPublicCode ? "\0" + excludedPublicCode : ""));

    // Все проверки старта идут внутри одной транзакции: сначала повтор запроса,
    // затем блокировка цепочки и только после неё создание новой заявки.
    return withTransaction(async (client) => {
      const existing = await client.query(
        "SELECT * FROM participation_starts WHERE session_hash = $1 AND idempotency_key = $2",
        [sessionHash, idempotencyKey],
      );
      if (existing.rowCount) {
        const start = existing.rows[0] as Row;
        if (String(start.request_hash) !== requestHash) throw new RelayError("START_IDEMPOTENCY_REUSED");
        const claimPointer = await client.query("SELECT chain_id FROM claims WHERE id = $1", [start.claim_id]);
        if (!claimPointer.rowCount) throw new RelayError("CLAIM_NOT_FOUND");
        const chain = await this.lockChain(client, String((claimPointer.rows[0] as Row).chain_id));
        const claimResult = await client.query(
          "SELECT * FROM claims WHERE id = $1 FOR UPDATE",
          [start.claim_id],
        );
        if (!claimResult.rowCount) throw new RelayError("CLAIM_NOT_FOUND");
        const claim = claimFromRow(claimResult.rows[0] as Row);
        if (claim.status === "EXPIRED") throw new RelayError("START_EXPIRED");
        if (claim.status === "CANCELLED") throw new RelayError("START_CANCELLED");
        if (claim.status === "ACTIVE" && claim.expiresAt.getTime() <= Date.now()) {
          await client.query("UPDATE claims SET status = 'EXPIRED', active_token_ciphertext = NULL WHERE id = $1", [claim.id]);
          throw new RelayError("START_EXPIRED");
        }
        await client.query("UPDATE participation_starts SET last_replayed_at = now() WHERE id = $1", [start.id]);
        return this.startResult(client, chain, claim, true);
      }

      const activeSessionPointer = await client.query(
        "SELECT id, chain_id FROM claims WHERE session_hash = $1 AND status = 'ACTIVE' LIMIT 1",
        [sessionHash],
      );
      if (activeSessionPointer.rowCount) {
        const sessionChain = await this.lockChain(client, String((activeSessionPointer.rows[0] as Row).chain_id));
        const sessionClaim = await client.query("SELECT * FROM claims WHERE id = $1 FOR UPDATE", [activeSessionPointer.rows[0].id]);
        if (sessionClaim.rowCount && new Date(String((sessionClaim.rows[0] as Row).expires_at)).getTime() <= Date.now()) {
          await client.query("UPDATE claims SET status = 'EXPIRED', active_token_ciphertext = NULL WHERE id = $1", [activeSessionPointer.rows[0].id]);
        } else {
          void sessionChain;
          throw new RelayError("SESSION_HAS_ACTIVE_CLAIM");
        }
      }

      let chain: Chain | null;
      if (requestedCode) {
        chain = await this.lockRequestedChain(client, requestedCode, language, sessionHash);
      } else {
        chain = await this.selectAvailableChain(client, language, sessionHash, excludedPublicCode);
        if (!chain) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [language]);
          const activeCount = await client.query(
            "SELECT count(*)::int AS count FROM chains WHERE language = $1 AND status = 'ACTIVE'",
            [language],
          );
          if (Number((activeCount.rows[0] as Row).count) >= ACTIVE_CHAIN_CAP) {
            throw new RelayError("NO_CHAIN_AVAILABLE");
          }
          chain = await this.createChainFromTheme(client, language);
        }
      }

      if (!chain) throw new RelayError("NO_CHAIN_AVAILABLE");
      await client.query(
        "UPDATE claims SET status = 'EXPIRED', active_token_ciphertext = NULL WHERE chain_id = $1 AND status = 'ACTIVE' AND expires_at <= now()",
        [chain.id],
      );
      const busy = await client.query(
        "SELECT id FROM claims WHERE chain_id = $1 AND status = 'ACTIVE' LIMIT 1",
        [chain.id],
      );
      if (busy.rowCount) throw new RelayError("CHAIN_BUSY");
      const participated = await client.query(
        "SELECT 1 FROM messages WHERE chain_id = $1 AND session_hash = $2 LIMIT 1",
        [chain.id, sessionHash],
      );
      if (participated.rowCount) throw new RelayError("SESSION_ALREADY_PARTICIPATED");

      const now = new Date();
      const token = randomBytes(32).toString("base64url");
      const claimResult = await client.query(
        "INSERT INTO claims (chain_id, hop_index, session_hash, claim_token_hash, active_token_ciphertext, claimed_at, expires_at) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [chain.id, chain.currentHop + 1, sessionHash, tokenHash(token), encryptToken(token), now, new Date(now.getTime() + CLAIM_TTL_SECONDS * 1000)],
      );
      const claim = claimFromRow(claimResult.rows[0] as Row);
      const startResult = await client.query(
        "INSERT INTO participation_starts (session_hash, idempotency_key, request_hash, chain_id, claim_id) " +
        "VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [sessionHash, idempotencyKey, requestHash, chain.id, claim.id],
      );
      await client.query("UPDATE claims SET start_request_id = $1 WHERE id = $2", [startResult.rows[0].id, claim.id]);
      return this.startResult(client, chain, claim, false, token);
    }, 3, true);
  }

  async submit(
    claimId: string,
    sessionHash: string,
    claimToken: string,
    idempotencyKey: string,
    text: string,
    countryCode?: string | null,
  ): Promise<SubmitResult> {
    if (!uuidV4(idempotencyKey)) throw new RelayError("INVALID_IDEMPOTENCY_KEY");
    if (!claimToken) throw new RelayError("CLAIM_TOKEN_INVALID");
    const country = countryOrNull(countryCode);
    // Отправка сначала блокирует заявку, а затем цепочку; этот порядок
    // одинаков во всех путях и предотвращает взаимную блокировку транзакций.
    return withTransaction(async (client) => {
      const claimPointer = await client.query("SELECT chain_id FROM claims WHERE id = $1", [claimId]);
      if (!claimPointer.rowCount) throw new RelayError("CLAIM_NOT_FOUND");
      const chain = await this.lockChain(client, String((claimPointer.rows[0] as Row).chain_id));
      const claimResult = await client.query("SELECT * FROM claims WHERE id = $1 FOR UPDATE", [claimId]);
      if (!claimResult.rowCount) throw new RelayError("CLAIM_NOT_FOUND");
      const claim = claimFromRow(claimResult.rows[0] as Row);
      if (claim.sessionHash !== sessionHash) throw new RelayError("CLAIM_OWNER_REQUIRED");

      if (claim.status === "SUBMITTED") {
        const replayHash = sha256Text(canonicalText(text));
        if (claim.idempotencyKey !== idempotencyKey || claim.submittedTextHash !== replayHash || claim.submittedCountryCode !== country) {
          throw new RelayError("IDEMPOTENCY_KEY_REUSED");
        }
        if (!claim.submittedMessageId) throw new RelayError("CHAIN_ADVANCED");
        const replayMessage = await client.query("SELECT * FROM messages WHERE id = $1", [claim.submittedMessageId]);
        if (!replayMessage.rowCount) throw new RelayError("CHAIN_ADVANCED");
        return this.submitResult(chain, messageFromRow(replayMessage.rows[0] as Row), true);
      }
      if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
      if (chain.status === "PAUSED") throw new RelayError("CHAIN_PAUSED");
      if (chain.status === "COMPLETED") throw new RelayError("CHAIN_COMPLETED");
      if (claim.status === "EXPIRED") throw new RelayError("CLAIM_EXPIRED");
      if (claim.status === "CANCELLED") throw new RelayError("CLAIM_CANCELLED");
      if (claim.expiresAt.getTime() <= Date.now()) {
        await client.query("UPDATE claims SET status = 'EXPIRED', active_token_ciphertext = NULL WHERE id = $1", [claim.id]);
        throw new RelayError("CLAIM_EXPIRED");
      }
      if (!sameHash(tokenHash(claimToken), claim.claimTokenHash)) throw new RelayError("CLAIM_TOKEN_INVALID");
      if (claim.hopIndex !== chain.currentHop + 1) throw new RelayError("CHAIN_ADVANCED");

      const validated = validateText(text);
      if (!validated.ok) throw new RelayError("TEXT_REJECTED", validated.reason);
      const previous = await this.previousText(client, chain);
      if (isDuplicateText(validated.normalized, previous)) throw new RelayError("TEXT_DUPLICATE");

      const parent = claim.hopIndex === 1
        ? null
        : await client.query("SELECT id FROM messages WHERE chain_id = $1 AND hop_index = $2", [chain.id, claim.hopIndex - 1]);
      const parentId = parent && parent.rowCount ? parent.rows[0].id : null;
      const messageResult = await client.query(
        "INSERT INTO messages (chain_id, hop_index, parent_id, text, word_count, text_hash, session_hash) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [chain.id, claim.hopIndex, parentId, validated.normalized, validated.wordCount, validated.textHash, sessionHash],
      );
      const message = messageFromRow(messageResult.rows[0] as Row);
      const completed = chain.currentHop + 1 >= CHAIN_TARGET_HOPS;
      await client.query(
        "UPDATE claims SET status = 'SUBMITTED', active_token_ciphertext = NULL, idempotency_key = $1, " +
        "submitted_message_id = $2, submitted_text_hash = $3, submitted_country_code = $4, submitted_at = now() WHERE id = $5",
        [idempotencyKey, message.id, validated.textHash, country, claim.id],
      );
      await client.query(
        "UPDATE chains SET current_hop = current_hop + 1, status = CASE WHEN $2 THEN 'COMPLETED'::chain_status ELSE status END, " +
        "completed_at = CASE WHEN $2 THEN now() ELSE completed_at END, updated_at = now(), last_activity_at = now() WHERE id = $1",
        [chain.id, completed],
      );
      await client.query(
        "INSERT INTO country_events (country_code, day_utc, event_type) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 'MESSAGE_SUBMITTED')",
        [country],
      );
      return this.submitResult({ ...chain, currentHop: chain.currentHop + 1, status: completed ? "COMPLETED" : chain.status, completedAt: completed ? new Date() : chain.completedAt }, message, false);
    });
  }

  async recover(publicCodeValue: string, sessionHash: string, recoverIdempotencyKey: string): Promise<RecoverResult> {
    if (!uuidV4(recoverIdempotencyKey)) throw new RelayError("INVALID_RECOVER_IDEMPOTENCY_KEY");
    const requestHash = sha256(publicCodeValue);
    // Восстановление меняет токен, поэтому сначала блокирует цепочку, затем
    // последнюю заявку этой сессии и помечает старые операции устаревшими.
    return withTransaction(async (client) => {
      const existing = await client.query(
        "SELECT * FROM recoveries WHERE session_hash = $1 AND recover_idempotency_key = $2",
        [sessionHash, recoverIdempotencyKey],
      );
      const chainResult = await client.query("SELECT * FROM chains WHERE public_code = $1 FOR UPDATE", [publicCodeValue]);
      if (!chainResult.rowCount) throw new RelayError("CHAIN_NOT_FOUND");
      const chain = chainFromRow(chainResult.rows[0] as Row);
      if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
      if (chain.status === "PAUSED") throw new RelayError("CHAIN_PAUSED");
      if (chain.status === "COMPLETED") throw new RelayError("CHAIN_COMPLETED");
      const claimResult = await client.query(
        "SELECT * FROM claims WHERE chain_id = $1 AND session_hash = $2 ORDER BY claimed_at DESC LIMIT 1 FOR UPDATE",
        [chain.id, sessionHash],
      );
      if (!claimResult.rowCount) throw new RelayError("CLAIM_OWNER_REQUIRED");
      const claim = claimFromRow(claimResult.rows[0] as Row);
      if (existing.rowCount) {
        const recovery = existing.rows[0] as Row;
        if (String(recovery.request_hash) !== requestHash) throw new RelayError("RECOVERY_IDEMPOTENCY_REUSED");
        if (String(recovery.status) === "STALE") throw new RelayError("RECOVERY_STALE");
        return this.recoverResult(client, chain, claim, decryptToken(String(recovery.token_ciphertext)), true);
      }
      if (claim.status === "CANCELLED") throw new RelayError("CLAIM_CANCELLED");
      if (claim.status === "SUBMITTED") throw new RelayError("CLAIM_SUBMITTED");
      if (claim.status === "EXPIRED" || claim.expiresAt.getTime() <= Date.now()) {
        await client.query("UPDATE claims SET status = 'EXPIRED', active_token_ciphertext = NULL WHERE id = $1", [claim.id]);
        throw new RelayError("CLAIM_EXPIRED");
      }
      await client.query("UPDATE recoveries SET status = 'STALE' WHERE claim_id = $1 AND status = 'ACTIVE'", [claim.id]);
      const token = randomBytes(32).toString("base64url");
      await client.query(
        "UPDATE claims SET claim_token_hash = $1, active_token_ciphertext = $2 WHERE id = $3",
        [tokenHash(token), encryptToken(token), claim.id],
      );
      await client.query(
        "INSERT INTO recoveries (session_hash, claim_id, recover_idempotency_key, request_hash, token_ciphertext, status) " +
        "VALUES ($1, $2, $3, $4, $5, 'ACTIVE')",
        [sessionHash, claim.id, recoverIdempotencyKey, requestHash, encryptToken(token)],
      );
      return this.recoverResult(client, chain, { ...claim, claimTokenHash: tokenHash(token) }, token, false);
    }, 3, true);
  }

  async report(messageId: string, reporterHash: string, reason: ReportReason, details?: string | null): Promise<ReportResult> {
    const normalizedDetails = details === undefined || details === null ? null : details.trim();
    if (normalizedDetails !== null && (Array.from(normalizedDetails).length < 1 || Array.from(normalizedDetails).length > 300)) {
      throw new RelayError("INVALID_BODY", "details");
    }
    // Жалоба блокирует сообщение перед проверкой повторной жалобы: так два
    // одновременных запроса не создадут дубликаты для одного отправителя.
    return withTransaction(async (client) => {
      const pointer = await client.query("SELECT chain_id FROM messages WHERE id = $1", [messageId]);
      if (!pointer.rowCount) throw new RelayError("MESSAGE_NOT_FOUND");
      const chain = await this.lockChain(client, String((pointer.rows[0] as Row).chain_id));
      if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
      if (chain.status !== "COMPLETED") throw new RelayError("REPORT_NOT_ALLOWED");
      const message = await client.query("SELECT id FROM messages WHERE id = $1 FOR UPDATE", [messageId]);
      if (!message.rowCount) throw new RelayError("MESSAGE_NOT_FOUND");
      const duplicate = await client.query(
        "SELECT id FROM reports WHERE message_id = $1 AND reporter_hash = $2 AND reason = $3",
        [messageId, reporterHash, reason],
      );
      if (duplicate.rowCount) throw new RelayError("REPORT_DUPLICATE");
      const result = await client.query(
        "INSERT INTO reports (message_id, reporter_hash, reason, details) VALUES ($1, $2, $3, $4) RETURNING id, status",
        [messageId, reporterHash, reason, normalizedDetails],
      );
      return { report: { id: String(result.rows[0].id), status: "OPEN" } };
    });
  }

  async stats(): Promise<PublicStats> {
    const pool = await import("../db/pool").then((module) => module.getPool());
    const result = await pool.query(
      "SELECT " +
      "(SELECT count(*) FROM chains WHERE status = 'ACTIVE')::int AS active_chains, " +
      "(SELECT count(*) FROM chains WHERE status = 'COMPLETED')::int AS completed_chains, " +
      "(SELECT count(*) FROM messages WHERE moderation_status IN ('ALLOWED', 'HIDDEN'))::int AS saved_messages, " +
      "(SELECT count(DISTINCT session_hash) FROM messages WHERE moderation_status IN ('ALLOWED', 'HIDDEN') AND created_at >= now() - interval '90 days')::int AS total_participants",
    );
    const row = result.rows[0] as Row;
    return {
      activeChains: Number(row.active_chains),
      completedChains: Number(row.completed_chains),
      savedMessages: Number(row.saved_messages),
      totalParticipants: Number(row.total_participants),
      updatedAt: new Date(),
    };
  }

  async mapStats(period: "24h" | "all"): Promise<PublicMapStats> {
    // Наружу выходят только страны с пятью и более событиями; остальные
    // складываются в общую группу, чтобы карта не раскрывала редкие события.
    // Период all действительно охватывает весь доступный retention-слой.
    const filter = period === "24h" ? " WHERE created_at >= now() - interval '24 hours'" : "";
    const pool = (await import("../db/pool")).getPool();
    const result = await pool.query(
      "WITH filtered AS (" +
      "SELECT country_code FROM country_events" + filter +
      "), counts AS (" +
      "SELECT country_code, count(*)::int AS event_count FROM filtered WHERE country_code IS NOT NULL GROUP BY country_code" +
      "), buckets AS (" +
      "SELECT country_code::text, event_count AS count FROM counts WHERE event_count >= 5 " +
      "UNION ALL SELECT 'OTHER', COALESCE(sum(event_count), 0)::int FROM counts WHERE event_count < 5 HAVING sum(event_count) > 0 " +
      "UNION ALL SELECT 'UNKNOWN', count(*)::int FROM filtered WHERE country_code IS NULL HAVING count(*) > 0" +
      ") " +
      "SELECT (SELECT count(*)::int FROM filtered) AS total_events, " +
      "COALESCE((SELECT json_agg(json_build_object('country_code', country_code, 'count', count) ORDER BY country_code) FROM buckets), '[]'::json) AS countries",
    );
    const row = result.rows[0] as { total_events: number | string; countries: Array<{ country_code: string; count: number }> | string };
    const rawCountries = typeof row.countries === "string" ? JSON.parse(row.countries) as Array<{ country_code: string; count: number }> : row.countries;
    return {
      period,
      totalEvents: Number(row.total_events),
      countries: rawCountries.map((country) => ({ countryCode: String(country.country_code), count: Number(country.count) })),
      updatedAt: new Date(),
    };
  }

  async runMaintenance(): Promise<MaintenanceResult> {
    // Обслуживание разделено на короткие транзакции: истечение заявок,
    // архивирование цепочек и очистка старых данных не удерживают общую блокировку.
    let expiredClaims = 0;
    let archivedChains = 0;
    let cancelledClaims = 0;
    let deletedRows = 0;

    // Завершение срока действия и архивирование намеренно выполняются раздельно.
    // Каждая операция сначала блокирует родительские цепочки, затем их заявки;
    // такой порядок совпадает с остальными записями и не допускает взаимной блокировки.
    const expiry = await withTransaction(async (client) => {
      const chains = await client.query(
        "SELECT id FROM chains " +
        "WHERE status = 'ACTIVE' AND EXISTS (SELECT 1 FROM claims WHERE claims.chain_id = chains.id " +
        "AND claims.status = 'ACTIVE' AND claims.expires_at <= now()) " +
        "ORDER BY id ASC FOR UPDATE",
      );
      let count = 0;
      for (const row of chains.rows as Row[]) {
        const chainId = String(row.id);
        await client.query("SELECT id FROM claims WHERE chain_id = $1 AND status = 'ACTIVE' ORDER BY id ASC FOR UPDATE", [chainId]);
        const result = await client.query(
          "UPDATE claims SET status = 'EXPIRED', active_token_ciphertext = NULL " +
          "WHERE chain_id = $1 AND status = 'ACTIVE' AND expires_at <= now()",
          [chainId],
        );
        count += result.rowCount ?? 0;
      }
      return count;
    });
    expiredClaims += expiry;

    const archival = await withTransaction(async (client) => {
      const chains = await client.query(
        "SELECT id FROM chains WHERE status = 'ACTIVE' AND last_activity_at < now() - interval '30 days' " +
        "ORDER BY id ASC FOR UPDATE",
      );
      let archived = 0;
      let cancelled = 0;
      for (const row of chains.rows as Row[]) {
        const chainId = String(row.id);
        await client.query("SELECT id FROM claims WHERE chain_id = $1 AND status = 'ACTIVE' ORDER BY id ASC FOR UPDATE", [chainId]);
        const chainResult = await client.query(
          "UPDATE chains SET status = 'ARCHIVED', updated_at = now() WHERE id = $1 AND status = 'ACTIVE'",
          [chainId],
        );
        archived += chainResult.rowCount ?? 0;
        const claimResult = await client.query(
          "UPDATE claims SET status = 'CANCELLED', active_token_ciphertext = NULL WHERE chain_id = $1 AND status = 'ACTIVE'",
          [chainId],
        );
        cancelled += claimResult.rowCount ?? 0;
        await client.query(
          "UPDATE reports SET status = 'CHAIN_ARCHIVED', resolved_at = now() " +
          "WHERE status = 'OPEN' AND message_id IN (SELECT id FROM messages WHERE chain_id = $1)",
          [chainId],
        );
      }
      return { archived, cancelled };
    });
    archivedChains += archival.archived;
    cancelledClaims += archival.cancelled;

    deletedRows = await withTransaction(async (client) => {
      const cleanupQueries = [
        "DELETE FROM participation_starts WHERE created_at < now() - interval '30 days'",
        "DELETE FROM recoveries r USING claims c WHERE r.claim_id = c.id AND (c.status <> 'ACTIVE' OR r.created_at < now() - interval '30 days')",
        "DELETE FROM admin_sessions WHERE expires_at <= now() OR revoked_at IS NOT NULL",
        "DELETE FROM rate_limit_buckets WHERE expires_at <= now()",
        "DELETE FROM sessions WHERE expires_at <= now() - interval '90 days'",
        "DELETE FROM claims WHERE status <> 'ACTIVE' AND COALESCE(submitted_at, expires_at, claimed_at) < now() - interval '90 days'",
        "DELETE FROM reports WHERE created_at < now() - interval '180 days'",
        "DELETE FROM events WHERE created_at < now() - interval '30 days'",
        "DELETE FROM country_events WHERE created_at < now() - interval '365 days'",
      ];
      let count = 0;
      for (const query of cleanupQueries) {
        const result = await client.query(query);
        count += result.rowCount ?? 0;
      }
      return count;
    });

    return { ranAt: new Date(), counts: { expiredClaims, archivedChains, cancelledClaims, deletedRows } };
  }

  async cancel(claimId: string, sessionHash: string): Promise<void> {
    return withTransaction(async (client) => {
      const pointer = await client.query("SELECT chain_id FROM claims WHERE id = $1", [claimId]);
      if (!pointer.rowCount) throw new RelayError("CLAIM_NOT_FOUND");
      const chain = await this.lockChain(client, String((pointer.rows[0] as Row).chain_id));
      const result = await client.query("SELECT * FROM claims WHERE id = $1 FOR UPDATE", [claimId]);
      if (!result.rowCount) throw new RelayError("CLAIM_NOT_FOUND");
      const claim = claimFromRow(result.rows[0] as Row);
      if (claim.sessionHash !== sessionHash) throw new RelayError("CLAIM_OWNER_REQUIRED");
      if (claim.status === "SUBMITTED") throw new RelayError("CLAIM_SUBMITTED");
      if (claim.status === "EXPIRED" || claim.status === "CANCELLED") return;
      if (claim.expiresAt.getTime() <= Date.now()) {
        await client.query("UPDATE claims SET status = 'EXPIRED', active_token_ciphertext = NULL WHERE id = $1", [claim.id]);
        return;
      }
      await client.query("UPDATE claims SET status = 'CANCELLED', active_token_ciphertext = NULL WHERE id = $1", [claim.id]);
      void chain;
    });
  }

  async getPublicState(code: string) {
    const pool = await import("../db/pool").then((module) => module.getPool());
    const chainResult = await pool.query("SELECT * FROM chains WHERE public_code = $1", [code]);
    if (!chainResult.rowCount) throw new RelayError("CHAIN_NOT_FOUND");
    const chain = chainFromRow(chainResult.rows[0] as Row);
    if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
    if (chain.status !== "COMPLETED") {
      return {
        publicCode: chain.publicCode,
        language: chain.language,
        status: chain.status,
        currentHop: chain.currentHop,
        targetHops: chain.targetHops,
        themeTitle: chain.themeTitleSnapshot,
        completedAt: chain.completedAt,
        messages: [] as Message[],
      };
    }
    const messages = await pool.query("SELECT * FROM messages WHERE chain_id = $1 ORDER BY hop_index ASC", [chain.id]);
    return {
      publicCode: chain.publicCode,
      language: chain.language,
      status: chain.status,
      currentHop: chain.currentHop,
      targetHops: chain.targetHops,
      themeTitle: chain.themeTitleSnapshot,
      completedAt: chain.completedAt,
      seedText: chain.seedTextSnapshot,
      messages: messages.rows.map((row) => messageFromRow(row as Row)),
    };
  }

  async listGallery(filters: {
    language?: Language;
    themeSlug?: string;
    period?: "30d" | "365d" | "all";
    cursor?: { completedAt: Date; publicCode: string } | null;
    limit?: number;
  } = {}): Promise<GalleryChain[]> {
    const pool = (await import("../db/pool")).getPool();
    const clauses = ["c.status = 'COMPLETED'", "c.completed_at IS NOT NULL"];
    const params: unknown[] = [];
    if (filters.language) {
      params.push(filters.language);
      clauses.push(`c.language = $${params.length}`);
    }
    if (filters.themeSlug) {
      const theme = await pool.query("SELECT id FROM themes WHERE slug = $1", [filters.themeSlug]);
      if (!theme.rowCount) throw new RelayError("THEME_NOT_FOUND");
      params.push(theme.rows[0].id);
      clauses.push(`c.theme_id = $${params.length}`);
    }
    if (filters.period && filters.period !== "all") {
      clauses.push(`c.completed_at >= now() - interval '${filters.period === "30d" ? "30 days" : "365 days"}'`);
    }
    if (filters.cursor) {
      params.push(filters.cursor.completedAt, filters.cursor.publicCode);
      clauses.push(`(c.completed_at < $${params.length - 1} OR (c.completed_at = $${params.length - 1} AND c.public_code > $${params.length}))`);
    }
    params.push(filters.limit ?? 13);
    const result = await pool.query(
      "SELECT c.public_code, c.language, c.theme_title_snapshot, c.completed_at, c.target_hops " +
      "FROM chains c WHERE " + clauses.join(" AND ") +
      ` ORDER BY c.completed_at DESC, c.public_code ASC LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => ({
      publicCode: String(row.public_code).trim(),
      language: row.language as Language,
      themeTitle: String(row.theme_title_snapshot),
      completedAt: new Date(String(row.completed_at)),
      targetHops: Number(row.target_hops),
    }));
  }

  async listAdminThemes(status: "DRAFT" | "ACTIVE" | "ARCHIVED" | "all" = "all"): Promise<AdminTheme[]> {
    const params: string[] = [];
    const where = status === "all" ? "" : " WHERE status = $1";
    if (status !== "all") params.push(status);
    const result = await (await import("../db/pool")).getPool().query(
      "SELECT * FROM themes" + where + " ORDER BY created_at DESC, id DESC",
      params,
    );
    return result.rows.map((row) => this.adminTheme(row as Row));
  }

  async createAdminTheme(input: {
    slug: string;
    titleRu: string;
    titleEn: string;
    seedTextRu: string;
    seedTextEn: string;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  }): Promise<AdminTheme> {
    const result = await (await import("../db/pool")).getPool().query(
      "INSERT INTO themes (slug, title_ru, title_en, seed_text_ru, seed_text_en, status) " +
      "VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [input.slug, input.titleRu, input.titleEn, input.seedTextRu, input.seedTextEn, input.status],
    );
    return this.adminTheme(result.rows[0] as Row);
  }

  async updateAdminTheme(id: string, patch: Partial<{
    slug: string;
    titleRu: string;
    titleEn: string;
    seedTextRu: string;
    seedTextEn: string;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  }>): Promise<AdminTheme> {
    return withTransaction(async (client) => {
      const current = await client.query("SELECT * FROM themes WHERE id = $1 FOR UPDATE", [id]);
      if (!current.rowCount) throw new RelayError("THEME_NOT_FOUND");
      if (patch.slug !== undefined && patch.slug !== String((current.rows[0] as Row).slug)) {
        const chain = await client.query("SELECT 1 FROM chains WHERE theme_id = $1 LIMIT 1", [id]);
        if (chain.rowCount) throw new RelayError("INVALID_STATE", "slug cannot change after a chain is created");
      }
      const columns: Array<[string, unknown]> = [];
      if (patch.slug !== undefined) columns.push(["slug", patch.slug]);
      if (patch.titleRu !== undefined) columns.push(["title_ru", patch.titleRu]);
      if (patch.titleEn !== undefined) columns.push(["title_en", patch.titleEn]);
      if (patch.seedTextRu !== undefined) columns.push(["seed_text_ru", patch.seedTextRu]);
      if (patch.seedTextEn !== undefined) columns.push(["seed_text_en", patch.seedTextEn]);
      if (patch.status !== undefined) columns.push(["status", patch.status]);
      if (columns.length === 0) throw new RelayError("INVALID_BODY");
      const assignments = columns.map(([column], index) => `${column} = $${index + 1}`).join(", ");
      const result = await client.query(`UPDATE themes SET ${assignments}, updated_at = now() WHERE id = $${columns.length + 1} RETURNING *`, [...columns.map(([, value]) => value), id]);
      return this.adminTheme(result.rows[0] as Row);
    });
  }

  async listAdminChains(filters: { language?: Language; status?: Chain["status"] | "all" } = {}): Promise<AdminChainSummary[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters.language) { params.push(filters.language); clauses.push(`language = $${params.length}`); }
    if (filters.status && filters.status !== "all") { params.push(filters.status); clauses.push(`status = $${params.length}`); }
    const result = await (await import("../db/pool")).getPool().query(
      "SELECT * FROM chains" + (clauses.length ? " WHERE " + clauses.join(" AND ") : "") + " ORDER BY created_at DESC, id DESC",
      params,
    );
    return result.rows.map((row) => this.adminChainSummary(chainFromRow(row as Row)));
  }

  async getAdminChain(code: string): Promise<AdminChainDetail> {
    const pool = (await import("../db/pool")).getPool();
    const result = await pool.query("SELECT * FROM chains WHERE public_code = $1", [code]);
    if (!result.rowCount) throw new RelayError("CHAIN_NOT_FOUND");
    const chain = chainFromRow(result.rows[0] as Row);
    const messages = await pool.query("SELECT id, hop_index, text, moderation_status, created_at FROM messages WHERE chain_id = $1 ORDER BY hop_index ASC", [chain.id]);
    return {
      ...this.adminChainSummary(chain),
      seed: { text: chain.seedTextSnapshot },
      messages: messages.rows.map((row) => ({ id: String(row.id), hopIndex: Number(row.hop_index), text: String(row.text), moderationStatus: row.moderation_status as Message["moderationStatus"], createdAt: new Date(String(row.created_at)) })),
    };
  }

  async createAdminChains(themeId: string, language: Language, count: number): Promise<AdminChainSummary[]> {
    return withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [language]);
      const themeResult = await client.query("SELECT * FROM themes WHERE id = $1 FOR SHARE", [themeId]);
      if (!themeResult.rowCount) throw new RelayError("THEME_NOT_FOUND");
      const theme = themeResult.rows[0] as Row;
      const seed = language === "ru" ? String(theme.seed_text_ru) : String(theme.seed_text_en);
      if (String(theme.status) !== "ACTIVE" || !seed.trim()) throw new RelayError("THEME_NOT_ACTIVE");
      const active = await client.query("SELECT count(*)::int AS count FROM chains WHERE language = $1 AND status = 'ACTIVE'", [language]);
      if (Number((active.rows[0] as Row).count) + count > ACTIVE_CHAIN_CAP) throw new RelayError("CHAIN_CAP_REACHED");
      const title = language === "ru" ? String(theme.title_ru) : String(theme.title_en);
      const created: AdminChainSummary[] = [];
      for (let index = 0; index < count; index += 1) {
        let code = publicCode();
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const exists = await client.query("SELECT 1 FROM chains WHERE public_code = $1", [code]);
          if (!exists.rowCount) break;
          code = publicCode();
        }
        const result = await client.query(
          "INSERT INTO chains (public_code, theme_id, theme_title_snapshot, seed_text_snapshot, language, target_hops) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
          [code, themeId, title, seed, language, CHAIN_TARGET_HOPS],
        );
        created.push(this.adminChainSummary(chainFromRow(result.rows[0] as Row)));
      }
      return created;
    });
  }

  async pauseAdminChain(code: string): Promise<AdminChainSummary> {
    return this.transitionAdminChain(code, "PAUSED");
  }

  async resumeAdminChain(code: string): Promise<AdminChainSummary> {
    return withTransaction(async (client) => {
      const chain = await this.lockAdminChainByCode(client, code);
      if (chain.status !== "PAUSED") throw new RelayError("INVALID_STATE");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [chain.language]);
      const active = await client.query("SELECT count(*)::int AS count FROM chains WHERE language = $1 AND status = 'ACTIVE'", [chain.language]);
      if (Number((active.rows[0] as Row).count) >= ACTIVE_CHAIN_CAP) throw new RelayError("CHAIN_CAP_REACHED");
      const result = await client.query("UPDATE chains SET status = 'ACTIVE', updated_at = now(), last_activity_at = now() WHERE id = $1 RETURNING *", [chain.id]);
      return this.adminChainSummary(chainFromRow(result.rows[0] as Row));
    });
  }

  async archiveAdminChain(code: string): Promise<AdminChainSummary> {
    return this.transitionAdminChain(code, "ARCHIVED");
  }

  async listAdminReports(status: "OPEN" | "DISMISSED" | "HIDDEN" | "CHAIN_ARCHIVED" | "all" = "all"): Promise<AdminReport[]> {
    const params: string[] = [];
    const where = status === "all" ? "" : " WHERE r.status = $1";
    if (status !== "all") params.push(status);
    const pool = (await import("../db/pool")).getPool();
    const result = await pool.query(
      "SELECT r.*, m.text, m.hop_index, m.moderation_status, m.created_at AS message_created_at, c.public_code, c.status AS chain_status, c.id AS chain_id " +
      "FROM reports r JOIN messages m ON m.id = r.message_id JOIN chains c ON c.id = m.chain_id" + where + " ORDER BY r.created_at DESC, r.id DESC",
      params,
    );
    return result.rows.map((row) => this.adminReport(row as Row));
  }

  async dismissAdminReport(id: string): Promise<AdminReport> {
    return this.resolveAdminReport(id, "DISMISSED");
  }

  async hideAdminReportMessage(id: string): Promise<{ report: AdminReport; message: Pick<Message, "id" | "moderationStatus"> }> {
    return withTransaction(async (client) => {
      const pointer = await client.query("SELECT message_id FROM reports WHERE id = $1", [id]);
      if (!pointer.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      const messagePointer = await client.query("SELECT chain_id FROM messages WHERE id = $1", [pointer.rows[0].message_id]);
      if (!messagePointer.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      await this.lockChain(client, String(messagePointer.rows[0].chain_id));
      const lockedMessage = await client.query("SELECT id FROM messages WHERE id = $1 FOR UPDATE", [pointer.rows[0].message_id]);
      if (!lockedMessage.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      const report = await client.query("SELECT * FROM reports WHERE id = $1 FOR UPDATE", [id]);
      if (!report.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      if (String((report.rows[0] as Row).status) !== "OPEN") throw new RelayError("REPORT_ALREADY_RESOLVED");
      const message = await client.query("UPDATE messages SET moderation_status = 'HIDDEN' WHERE id = $1 RETURNING id, moderation_status", [pointer.rows[0].message_id]);
      await client.query("UPDATE reports SET status = 'HIDDEN', resolved_at = now() WHERE id = $1", [id]);
      const result = await this.adminReportById(client, id);
      return { report: result, message: { id: String(message.rows[0].id), moderationStatus: message.rows[0].moderation_status as Message["moderationStatus"] } };
    });
  }

  async archiveAdminReportChain(id: string): Promise<{ report: AdminReport; chain: AdminChainSummary }> {
    return withTransaction(async (client) => {
      const pointer = await client.query("SELECT message_id FROM reports WHERE id = $1", [id]);
      if (!pointer.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      const chainPointer = await client.query("SELECT chain_id FROM messages WHERE id = $1", [pointer.rows[0].message_id]);
      if (!chainPointer.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      const chain = await this.lockChain(client, String(chainPointer.rows[0].chain_id));
      const lockedMessage = await client.query("SELECT id FROM messages WHERE id = $1 FOR UPDATE", [pointer.rows[0].message_id]);
      if (!lockedMessage.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      const report = await client.query("SELECT status FROM reports WHERE id = $1 FOR UPDATE", [id]);
      if (!report.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      if (String((report.rows[0] as Row).status) !== "OPEN") throw new RelayError("REPORT_ALREADY_RESOLVED");
      await client.query("UPDATE chains SET status = 'ARCHIVED', updated_at = now() WHERE id = $1", [chain.id]);
      await this.archiveChainInTransaction(client, chain.id);
      const selected = await this.adminReportById(client, id);
      const updatedChain = await this.lockChain(client, chain.id);
      return { report: selected, chain: this.adminChainSummary(updatedChain) };
    });
  }

  private adminTheme(row: Row): AdminTheme {
    return {
      id: String(row.id),
      slug: String(row.slug),
      titleRu: String(row.title_ru),
      titleEn: String(row.title_en),
      seedTextRu: String(row.seed_text_ru),
      seedTextEn: String(row.seed_text_en),
      status: row.status as AdminTheme["status"],
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at)),
    };
  }

  private adminChainSummary(chain: Chain): AdminChainSummary {
    return {
      publicCode: chain.publicCode,
      language: chain.language,
      themeTitle: chain.themeTitleSnapshot,
      currentHop: chain.currentHop,
      targetHops: chain.targetHops,
      status: chain.status,
      lastActivityAt: chain.lastActivityAt,
      createdAt: chain.createdAt,
      completedAt: chain.completedAt,
    };
  }

  private adminReport(row: Row): AdminReport {
    return {
      id: String(row.id),
      status: row.status as AdminReport["status"],
      reason: row.reason as ReportReason,
      details: row.details === null || row.details === undefined ? null : String(row.details),
      createdAt: new Date(String(row.created_at)),
      resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)) : null,
      message: {
        id: String(row.message_id),
        chainPublicCode: String(row.public_code).trim(),
        hopIndex: Number(row.hop_index),
        text: String(row.text),
        moderationStatus: row.moderation_status as Message["moderationStatus"],
      },
      chain: { publicCode: String(row.public_code).trim(), status: row.chain_status as Chain["status"] },
    };
  }

  private async adminReportById(client: PoolClient, id: string): Promise<AdminReport> {
    const result = await client.query(
      "SELECT r.*, m.text, m.hop_index, m.moderation_status, c.public_code, c.status AS chain_status " +
      "FROM reports r JOIN messages m ON m.id = r.message_id JOIN chains c ON c.id = m.chain_id WHERE r.id = $1",
      [id],
    );
    if (!result.rowCount) throw new RelayError("REPORT_NOT_FOUND");
    return this.adminReport(result.rows[0] as Row);
  }

  private async resolveAdminReport(id: string, status: "DISMISSED"): Promise<AdminReport> {
    return withTransaction(async (client) => {
      const pointer = await client.query("SELECT message_id FROM reports WHERE id = $1", [id]);
      if (!pointer.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      const messagePointer = await client.query("SELECT chain_id FROM messages WHERE id = $1", [pointer.rows[0].message_id]);
      if (!messagePointer.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      await this.lockChain(client, String(messagePointer.rows[0].chain_id));
      const lockedMessage = await client.query("SELECT id FROM messages WHERE id = $1 FOR UPDATE", [pointer.rows[0].message_id]);
      if (!lockedMessage.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      const report = await client.query("SELECT status FROM reports WHERE id = $1 FOR UPDATE", [id]);
      if (!report.rowCount) throw new RelayError("REPORT_NOT_FOUND");
      if (String((report.rows[0] as Row).status) !== "OPEN") throw new RelayError("REPORT_ALREADY_RESOLVED");
      await client.query("UPDATE reports SET status = $1, resolved_at = now() WHERE id = $2", [status, id]);
      return this.adminReportById(client, id);
    });
  }

  private async lockAdminChainByCode(client: PoolClient, code: string): Promise<Chain> {
    const result = await client.query("SELECT * FROM chains WHERE public_code = $1 FOR UPDATE", [code]);
    if (!result.rowCount) throw new RelayError("CHAIN_NOT_FOUND");
    return chainFromRow(result.rows[0] as Row);
  }

  private async transitionAdminChain(code: string, target: "PAUSED" | "ARCHIVED"): Promise<AdminChainSummary> {
    return withTransaction(async (client) => {
      const chain = await this.lockAdminChainByCode(client, code);
      if (target === "PAUSED" && chain.status !== "ACTIVE") throw new RelayError("INVALID_STATE");
      if (target === "ARCHIVED" && chain.status === "ARCHIVED") throw new RelayError("INVALID_STATE");
      await client.query("UPDATE chains SET status = $1, updated_at = now() WHERE id = $2", [target, chain.id]);
      await this.archiveChainInTransaction(client, chain.id);
      const updated = await this.lockChain(client, chain.id);
      return this.adminChainSummary(updated);
    });
  }

  private async archiveChainInTransaction(client: PoolClient, chainId: string): Promise<void> {
    await client.query("UPDATE claims SET status = 'CANCELLED', active_token_ciphertext = NULL WHERE chain_id = $1 AND status = 'ACTIVE'", [chainId]);
    await client.query(
      "UPDATE reports SET status = 'CHAIN_ARCHIVED', resolved_at = now() WHERE status = 'OPEN' AND message_id IN (SELECT id FROM messages WHERE chain_id = $1)",
      [chainId],
    );
  }

  private async selectAvailableChain(
    client: PoolClient,
    language: Language,
    sessionHash: string,
    excludedPublicCode?: string | null,
  ): Promise<Chain | null> {
    const result = await client.query(
      "SELECT c.* FROM chains c WHERE c.language = $1 AND c.status = 'ACTIVE' AND c.current_hop < c.target_hops " +
      "AND ($3::text IS NULL OR c.public_code <> $3) " +
      "AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.chain_id = c.id AND m.session_hash = $2) " +
      "AND NOT EXISTS (SELECT 1 FROM claims cl WHERE cl.chain_id = c.id AND cl.status = 'ACTIVE' AND cl.expires_at > now()) " +
      "ORDER BY c.current_hop::numeric / NULLIF(c.target_hops, 0), random() LIMIT 1 FOR UPDATE SKIP LOCKED",
      [language, sessionHash, excludedPublicCode ?? null],
    );
    return result.rowCount ? chainFromRow(result.rows[0] as Row) : null;
  }

  private async lockRequestedChain(client: PoolClient, code: string, language: Language, sessionHash: string): Promise<Chain> {
    const result = await client.query("SELECT * FROM chains WHERE public_code = $1 FOR UPDATE", [code]);
    if (!result.rowCount) throw new RelayError("CHAIN_NOT_FOUND");
    const chain = chainFromRow(result.rows[0] as Row);
    if (chain.status === "COMPLETED") throw new RelayError("CHAIN_COMPLETED");
    if (chain.status === "PAUSED") throw new RelayError("CHAIN_PAUSED");
    if (chain.status === "ARCHIVED") throw new RelayError("CHAIN_ARCHIVED");
    if (chain.language !== language) throw new RelayError("LANGUAGE_MISMATCH");
    const participated = await client.query("SELECT 1 FROM messages WHERE chain_id = $1 AND session_hash = $2", [chain.id, sessionHash]);
    if (participated.rowCount) throw new RelayError("SESSION_ALREADY_PARTICIPATED");
    return chain;
  }

  private async createChainFromTheme(client: PoolClient, language: Language): Promise<Chain> {
    const themeResult = await client.query(
      "SELECT * FROM themes WHERE status = 'ACTIVE' ORDER BY random() LIMIT 1",
    );
    if (!themeResult.rowCount) throw new RelayError("NO_ACTIVE_SEED");
    const theme = themeResult.rows[0] as Row;
    let code = publicCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = await client.query("SELECT 1 FROM chains WHERE public_code = $1", [code]);
      if (!exists.rowCount) break;
      code = publicCode();
    }
    const title = language === "ru" ? String(theme.title_ru) : String(theme.title_en);
    const seed = language === "ru" ? String(theme.seed_text_ru) : String(theme.seed_text_en);
    const result = await client.query(
      "INSERT INTO chains (public_code, theme_id, theme_title_snapshot, seed_text_snapshot, language, target_hops) " +
      "VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [code, theme.id, title, seed, language, CHAIN_TARGET_HOPS],
    );
    return chainFromRow(result.rows[0] as Row);
  }

  private async lockChain(client: PoolClient, chainId: string): Promise<Chain> {
    const result = await client.query("SELECT * FROM chains WHERE id = $1 FOR UPDATE", [chainId]);
    if (!result.rowCount) throw new RelayError("CHAIN_NOT_FOUND");
    return chainFromRow(result.rows[0] as Row);
  }

  private async previousText(client: PoolClient, chain: Chain): Promise<string> {
    if (chain.currentHop === 0) return chain.seedTextSnapshot;
    const result = await client.query(
      "SELECT text FROM messages WHERE chain_id = $1 AND hop_index = $2",
      [chain.id, chain.currentHop],
    );
    return result.rowCount ? String(result.rows[0].text) : chain.seedTextSnapshot;
  }

  private async startResult(client: PoolClient, chain: Chain, claim: Claim, replayed: boolean, token?: string): Promise<StartResult> {
    return {
      replayed,
      chain: { publicCode: chain.publicCode, language: chain.language, currentHop: chain.currentHop, targetHops: chain.targetHops, status: chain.status },
      claim: {
        id: claim.id,
        hopIndex: claim.hopIndex,
        status: claim.status,
        expiresAt: claim.status === "ACTIVE" ? claim.expiresAt : null,
        submittedMessageId: claim.submittedMessageId,
        claimToken: claim.status === "ACTIVE"
          ? (token ?? decryptToken(String((await client.query("SELECT active_token_ciphertext FROM claims WHERE id = $1", [claim.id])).rows[0].active_token_ciphertext)))
          : null,
      },
      previousText: await this.previousText(client, chain),
    };
  }

  private submitResult(chain: Chain, message: Message, replayed: boolean): SubmitResult {
    return {
      replayed,
      message: { id: message.id, hopIndex: message.hopIndex, text: message.text, wordCount: message.wordCount, createdAt: message.createdAt },
      chain: { publicCode: chain.publicCode, currentHop: chain.currentHop, targetHops: chain.targetHops, status: chain.status },
    };
  }

  private async recoverResult(client: PoolClient, chain: Chain, claim: Claim, token: string, replayed: boolean): Promise<RecoverResult> {
    return {
      recovered: true,
      replayed,
      chain: { publicCode: chain.publicCode, currentHop: chain.currentHop, targetHops: chain.targetHops, status: chain.status },
      claim: {
        id: claim.id,
        hopIndex: claim.hopIndex,
        status: claim.status,
        expiresAt: claim.expiresAt,
        submittedMessageId: claim.submittedMessageId,
        claimToken: token,
      },
      previousText: await this.previousText(client, chain),
    };
  }
}
