// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { PostgresRelay } from "../../lib/relay/postgres";

const acceptanceEnabled = Boolean(process.env.DATABASE_URL && process.env.POSTGRES_ACCEPTANCE === "1");
const mutationEnabled = acceptanceEnabled && process.env.POSTGRES_ACCEPTANCE_MUTATE === "1";
const acceptanceSuite = acceptanceEnabled ? describe : describe.skip;
const mutationSuite = mutationEnabled ? describe : describe.skip;

const longText = "Это достаточно длинный пересказ, который проходит минимальные ограничения и меняет исходную формулировку.";
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sslConfig(): { rejectUnauthorized: false } | undefined {
  return process.env.DATABASE_SSL === "disable" ? undefined : { rejectUnauthorized: false };
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function publicCode(): string {
  const suffix = randomUUID().replaceAll("-", "");
  return "T" + Array.from({ length: 9 }, (_, index) => alphabet[Number.parseInt(suffix[index], 16) % alphabet.length]).join("");
}

async function closeQuietly(pool: Pool | undefined): Promise<void> {
  if (!pool) return;
  await pool.end();
}

acceptanceSuite("PostgreSQL acceptance gates (read-only)", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig() });
    await pool.query("SELECT 1");
  });

  afterAll(async () => closeQuietly(pool));

  it("has the required tables, constraints and indexes", async () => {
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [["themes", "chains", "sessions", "admin_sessions", "messages", "claims", "participation_starts", "recoveries", "reports", "country_events", "events", "rate_limit_buckets"]],
    );
    expect(new Set(tables.rows.map((row) => row.table_name))).toEqual(new Set([
      "themes", "chains", "sessions", "admin_sessions", "messages", "claims", "participation_starts", "recoveries", "reports", "country_events", "events", "rate_limit_buckets",
    ]));

    const indexes = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])",
      [["claims_active_chain_hop_uidx", "claims_active_session_uidx", "claims_session_idempotency_uidx", "recoveries_active_claim_uidx"]],
    );
    expect(new Set(indexes.rows.map((row) => row.indexname))).toEqual(new Set([
      "claims_active_chain_hop_uidx", "claims_active_session_uidx", "claims_session_idempotency_uidx", "recoveries_active_claim_uidx",
    ]));

    const foreignKeys = await pool.query<{ condef: string }>(
      "SELECT pg_get_constraintdef(oid) AS condef FROM pg_constraint WHERE conname IN ('participation_starts_claim_id_fkey', 'claims_start_request_id_fkey')",
    );
    expect(foreignKeys.rows).toHaveLength(2);
    expect(foreignKeys.rows.every((row) => /DEFERRABLE INITIALLY DEFERRED/u.test(row.condef))).toBe(true);
  });

  it("keeps seeded chain counts within the per-language cap", async () => {
    const result = await pool.query<{ language: string; count: number | string }>(
      "SELECT language, count(*)::int AS count FROM chains WHERE status = 'ACTIVE' GROUP BY language ORDER BY language",
    );
    const counts = new Map(result.rows.map((row) => [row.language, Number(row.count)]));
    expect(counts.get("ru")).toBeGreaterThanOrEqual(20);
    expect(counts.get("en")).toBeGreaterThanOrEqual(20);
    expect(counts.get("ru")).toBeLessThanOrEqual(50);
    expect(counts.get("en")).toBeLessThanOrEqual(50);
  });
});

mutationSuite("PostgreSQL acceptance gates (mutating opt-in)", () => {
  let pool: Pool;
  let relay: PostgresRelay;
  let themeId = "";
  let chainId = "";
  let chainCode = "";
  const chainIds: string[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig() });
    relay = new PostgresRelay();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const theme = await client.query<{ id: string }>(
        "INSERT INTO themes (slug, title_ru, title_en, seed_text_ru, seed_text_en, status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE') RETURNING id",
        [`acceptance-${Date.now()}-${randomUUID().slice(0, 8)}`, "Acceptance theme", "Acceptance theme", longText, longText,],
      );
      themeId = theme.rows[0].id;
      chainCode = publicCode();
      const chain = await client.query<{ id: string }>(
        "INSERT INTO chains (public_code, theme_id, theme_title_snapshot, seed_text_snapshot, language, target_hops) VALUES ($1, $2, $3, $4, 'ru', 12) RETURNING id",
        [chainCode, themeId, "Acceptance theme", longText],
      );
      chainId = chain.rows[0].id;
      chainIds.push(chainId);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (pool && chainIds.length) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const id of chainIds) {
          await client.query("DELETE FROM reports WHERE message_id IN (SELECT id FROM messages WHERE chain_id = $1)", [id]);
          await client.query("UPDATE claims SET submitted_message_id = NULL, start_request_id = NULL WHERE chain_id = $1", [id]);
          await client.query("DELETE FROM messages WHERE chain_id = $1", [id]);
          await client.query("DELETE FROM claims WHERE chain_id = $1", [id]);
          await client.query("DELETE FROM participation_starts WHERE chain_id = $1", [id]);
          await client.query("DELETE FROM chains WHERE id = $1", [id]);
        }
        if (themeId) await client.query("DELETE FROM themes WHERE id = $1", [themeId]);
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
    await closeQuietly(pool);
  });

  async function createChainForTest(): Promise<{ id: string; code: string }> {
    // Каждый изменяющий тест получает отдельную цепочку, чтобы порядок
    // выполнения проверок не влиял на результат и очистку после прогона.
    const client = await pool.connect();
    try {
      const code = publicCode();
      const result = await client.query<{ id: string }>(
        "INSERT INTO chains (public_code, theme_id, theme_title_snapshot, seed_text_snapshot, language, target_hops) VALUES ($1, $2, $3, $4, 'ru', 12) RETURNING id",
        [code, themeId, "Acceptance theme", longText],
      );
      const id = result.rows[0].id;
      chainIds.push(id);
      return { id, code };
    } finally {
      client.release();
    }
  }

  async function completeChain(code: string): Promise<{ lastMessageId: string }> {
    // Для завершения нужны разные сессии: одна сессия не может повторно
    // участвовать в той же цепочке по правилам предметной области.
    let sessionHash = hash(`completion-${randomUUID()}`);
    let started = await relay.start("ru", sessionHash, randomUUID(), code);
    let lastMessageId = "";
    for (let hop = 1; hop <= 12; hop += 1) {
      const submitted = await relay.submit(
        started.claim.id,
        sessionHash,
        started.claim.claimToken!,
        randomUUID(),
        `${longText} ход ${hop}`,
        "FI",
      );
      lastMessageId = submitted.message.id;
      if (hop < 12) {
        sessionHash = hash(`completion-${randomUUID()}`);
        started = await relay.start("ru", sessionHash, randomUUID(), code);
      }
    }
    return { lastMessageId };
  }

  it("keeps one active claim for a session and replays one submitted message", async () => {
    const sessionHash = hash(`session-${randomUUID()}`);
    const started = await relay.start("ru", sessionHash, randomUUID(), chainCode);
    await expect(relay.start("ru", sessionHash, randomUUID(), chainCode)).rejects.toMatchObject({ code: "SESSION_HAS_ACTIVE_CLAIM" });

    const submitKey = randomUUID();
    const submissions = await Promise.all(Array.from({ length: 20 }, () => relay.submit(
      started.claim.id,
      sessionHash,
      started.claim.claimToken!,
      submitKey,
      longText,
      "FI",
    )));
    expect(submissions.filter((result) => !result.replayed)).toHaveLength(1);
    expect(submissions.filter((result) => result.replayed)).toHaveLength(19);
    const messages = await pool.query<{ count: number | string }>("SELECT count(*)::int AS count FROM messages WHERE chain_id = $1", [chainId]);
    expect(Number(messages.rows[0].count)).toBe(1);
    await expect(relay.submit(started.claim.id, sessionHash, "", submitKey, `${longText} changed`, "FI")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects a deferred participation FK at commit and rolls back the transaction", async () => {
    const client: PoolClient = await pool.connect();
    const missingClaim = randomUUID();
    const startIdempotency = randomUUID();
    const sessionHash = hash(`deferred-${randomUUID()}`);
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO participation_starts (session_hash, idempotency_key, request_hash, chain_id, claim_id) VALUES ($1, $2, $3, $4, $5)",
        [sessionHash, startIdempotency, hash("deferred"), chainId, missingClaim],
      );
      await expect(client.query("COMMIT")).rejects.toThrow();
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const rows = await pool.query("SELECT 1 FROM participation_starts WHERE session_hash = $1", [sessionHash]);
    expect(rows.rowCount).toBe(0);
  });

  it("completes exactly on the twelfth message and rejects the thirteenth start", async () => {
    const fixture = await createChainForTest();
    await completeChain(fixture.code);

    const state = await pool.query<{ status: string; current_hop: number | string }>(
      "SELECT status, current_hop FROM chains WHERE id = $1",
      [fixture.id],
    );
    expect(state.rows[0]).toMatchObject({ status: "COMPLETED", current_hop: 12 });
    const messages = await pool.query<{ count: number | string }>("SELECT count(*)::int AS count FROM messages WHERE chain_id = $1", [fixture.id]);
    const claims = await pool.query<{ count: number | string }>("SELECT count(*)::int AS count FROM claims WHERE chain_id = $1", [fixture.id]);
    expect(Number(messages.rows[0].count)).toBe(12);
    expect(Number(claims.rows[0].count)).toBe(12);
    await expect(relay.start("ru", hash(`after-completion-${randomUUID()}`), randomUUID(), fixture.code)).rejects.toMatchObject({ code: "CHAIN_COMPLETED" });
  });

  it("закрывает жалобу вместе с архивированием завершённой цепочки", async () => {
    const fixture = await createChainForTest();
    const completed = await completeChain(fixture.code);
    const report = await relay.report(completed.lastMessageId, hash(`reporter-${randomUUID()}`), "SPAM", "Проверка архивирования");

    const archived = await relay.archiveAdminReportChain(report.report.id);
    expect(archived.chain.status).toBe("ARCHIVED");
    expect(archived.report.status).toBe("CHAIN_ARCHIVED");
    const persisted = await pool.query<{ status: string; resolved_at: Date | null }>("SELECT status, resolved_at FROM reports WHERE id = $1", [report.report.id]);
    expect(persisted.rows[0].status).toBe("CHAIN_ARCHIVED");
    expect(persisted.rows[0].resolved_at).not.toBeNull();
  });
});
