// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryRelay } from "../../lib/relay/in-memory";
import { RelayError } from "../../packages/shared/types/relay";

const id = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
const longText = "Это достаточно длинный пересказ, который проходит минимальные ограничения и меняет исходную формулировку.";

describe("relay core", () => {
  it("creates a claim and replays the same start idempotently", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const first = relay.start("ru", "session-a", id, chain.publicCode);
    const replay = relay.start("ru", "session-a", id, chain.publicCode);
    expect(first.claim.id).toBe(replay.claim.id);
    expect(replay.replayed).toBe(true);
    expect(replay.claim.claimToken).toBe(first.claim.claimToken);
  });

  it("accepts the first submit and replays it without creating a second message", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "session-a", id, chain.publicCode);
    const submitted = relay.submit(started.claim.id, "session-a", started.claim.claimToken!, id2, longText, "FI");
    const replay = relay.submit(started.claim.id, "session-a", started.claim.claimToken!, id2, longText, "fi");
    expect(submitted.message.id).toBe(replay.message.id);
    expect(replay.replayed).toBe(true);
    expect(relay.getPublicState(chain.publicCode).currentHop).toBe(1);
  });

  it("rotates a generic start to a new theme after the session submits a move", () => {
    const relay = new InMemoryRelay();
    const first = relay.start("ru", "session-a", id);
    relay.submit(first.claim.id, "session-a", first.claim.claimToken!, id2, longText);

    const next = relay.start("ru", "session-a", "33333333-3333-4333-8333-333333333333");
    expect(next.chain.publicCode).not.toBe(first.chain.publicCode);
    expect(next.chain.currentHop).toBe(0);
    expect(next.claim.hopIndex).toBe(1);
    expect(next.previousText).not.toBe(first.previousText);
  });

  it("honors a generic chain exclusion while leaving invited starts explicit", () => {
    const relay = new InMemoryRelay();
    const firstChain = relay.seedChain("ru");
    const secondChain = relay.seedChain("ru");
    const excluded = relay.start("ru", "session-a", id, null, firstChain.publicCode);
    expect(excluded.chain.publicCode).toBe(secondChain.publicCode);
    const invited = relay.start("ru", "session-b", id2, firstChain.publicCode);
    expect(invited.chain.publicCode).toBe(firstChain.publicCode);
  });

  it("rejects a same-key submit when text or country changes", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "session-a", id, chain.publicCode);
    relay.submit(started.claim.id, "session-a", started.claim.claimToken!, id2, longText, "FI");
    expect(() => relay.submit(started.claim.id, "session-a", "", id2, longText + " другое", "FI")).toThrowError(
      new RelayError("IDEMPOTENCY_KEY_REUSED"),
    );
    expect(() => relay.submit(started.claim.id, "session-a", "", id2, longText, "DE")).toThrowError(
      new RelayError("IDEMPOTENCY_KEY_REUSED"),
    );
    expect(relay.getPublicState(chain.publicCode).currentHop).toBe(1);
  });

  it("keeps one message when duplicate submit calls overlap", async () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "session-a", id, chain.publicCode);
    const submitKey = randomUUID();
    const submissions = await Promise.all([
      Promise.resolve().then(() => relay.submit(started.claim.id, "session-a", started.claim.claimToken!, submitKey, longText)),
      Promise.resolve().then(() => relay.submit(started.claim.id, "session-a", started.claim.claimToken!, submitKey, longText)),
    ]);

    expect(new Set(submissions.map((result) => result.message.id)).size).toBe(1);
    expect(submissions.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(relay.getPublicState(chain.publicCode).currentHop).toBe(1);
    expect(relay.getAdminChain(chain.publicCode).messages).toHaveLength(1);
  });

  it("keeps the claim active when text validation fails", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "session-a", id, chain.publicCode);
    expect(() => relay.submit(started.claim.id, "session-a", started.claim.claimToken!, id2, "коротко")).toThrowError(
      new RelayError("TEXT_REJECTED", "TOO_SHORT"),
    );
    const recovered = relay.start("ru", "session-a", id, chain.publicCode);
    expect(recovered.claim.id).toBe(started.claim.id);
    expect(recovered.claim.status).toBe("ACTIVE");
  });

  it("rejects reserved and malformed ISO country codes", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "country-session", id, chain.publicCode);

    for (const countryCode of ["AA", "ZZ", "A", "USA"]) {
      expect(() => relay.submit(
        started.claim.id,
        "country-session",
        started.claim.claimToken!,
        id2,
        longText,
        countryCode,
      )).toThrowError(new RelayError("INVALID_COUNTRY_CODE"));
    }
    expect(relay.getPublicState(chain.publicCode).currentHop).toBe(0);
  });

  it("keeps terminal claim transitions explicit", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const cancelled = relay.start("ru", "cancel-session", id, chain.publicCode);
    relay.cancel(cancelled.claim.id, "cancel-session");
    expect(() => relay.submit(cancelled.claim.id, "cancel-session", cancelled.claim.claimToken!, id2, longText)).toThrowError(
      new RelayError("CLAIM_CANCELLED"),
    );
    expect(() => relay.recover(chain.publicCode, "cancel-session", "33333333-3333-4333-8333-333333333333")).toThrowError(
      new RelayError("CLAIM_CANCELLED"),
    );

    const submitted = relay.start("ru", "submitted-session", id2, chain.publicCode);
    relay.submit(submitted.claim.id, "submitted-session", submitted.claim.claimToken!, "44444444-4444-4444-8444-444444444444", longText);
    expect(() => relay.cancel(submitted.claim.id, "submitted-session")).toThrowError(new RelayError("CLAIM_SUBMITTED"));
    expect(() => relay.recover(chain.publicCode, "submitted-session", "55555555-5555-4555-8555-555555555555")).toThrowError(
      new RelayError("CLAIM_SUBMITTED"),
    );
  });

  it("rejects start-key reuse, expiry replay, and cancelled replay explicitly", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    relay.start("ru", "reuse-session", id, chain.publicCode);
    expect(() => relay.start("en", "reuse-session", id, chain.publicCode)).toThrowError(new RelayError("START_IDEMPOTENCY_REUSED"));

    let current = new Date("2026-01-01T00:00:00.000Z");
    const expiredRelay = new InMemoryRelay({ now: () => current });
    const expiredChain = expiredRelay.seedChain("ru");
    expiredRelay.start("ru", "expired-session", id, expiredChain.publicCode);
    current = new Date(current.getTime() + 181_000);
    expect(() => expiredRelay.start("ru", "expired-session", id, expiredChain.publicCode)).toThrowError(new RelayError("START_EXPIRED"));

    const cancelledRelay = new InMemoryRelay();
    const cancelledChain = cancelledRelay.seedChain("ru");
    const cancelled = cancelledRelay.start("ru", "cancelled-session", id, cancelledChain.publicCode);
    cancelledRelay.cancel(cancelled.claim.id, "cancelled-session");
    expect(() => cancelledRelay.start("ru", "cancelled-session", id, cancelledChain.publicCode)).toThrowError(new RelayError("START_CANCELLED"));
  });

  it("rejects a submit after the claim expiry boundary", () => {
    let current = new Date("2026-01-01T00:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => current });
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "expired-submit-session", randomUUID(), chain.publicCode);
    current = new Date(current.getTime() + 181_000);
    expect(() => relay.submit(started.claim.id, "expired-submit-session", started.claim.claimToken!, randomUUID(), longText)).toThrowError(new RelayError("CLAIM_EXPIRED"));
  });

  it("enforces status precedence before language on invited starts", () => {
    const pausedRelay = new InMemoryRelay();
    const paused = pausedRelay.seedChain("ru");
    pausedRelay.pauseAdminChain(paused.publicCode);
    expect(() => pausedRelay.start("en", "paused-session", id, paused.publicCode)).toThrowError(new RelayError("CHAIN_PAUSED"));

    const archivedRelay = new InMemoryRelay();
    const archived = archivedRelay.seedChain("ru");
    archivedRelay.archiveAdminChain(archived.publicCode);
    expect(() => archivedRelay.start("en", "archived-session", id, archived.publicCode)).toThrowError(new RelayError("CHAIN_ARCHIVED"));

    const completedRelay = new InMemoryRelay();
    const completed = completedRelay.seedChain("ru");
    for (let hop = 1; hop <= 12; hop += 1) {
      const session = `completed-status-${hop}`;
      const started = completedRelay.start("ru", session, randomUUID(), completed.publicCode);
      completedRelay.submit(started.claim.id, session, started.claim.claimToken!, randomUUID(), longText + ` status ${hop}`);
    }
    expect(() => completedRelay.start("en", "completed-session", id, completed.publicCode)).toThrowError(new RelayError("CHAIN_COMPLETED"));

    const activeRelay = new InMemoryRelay();
    const active = activeRelay.seedChain("ru");
    expect(() => activeRelay.start("en", "language-session", id, active.publicCode)).toThrowError(new RelayError("LANGUAGE_MISMATCH"));
  });

  it("rejects recovery for a session without a claim", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    expect(() => relay.recover(chain.publicCode, "unknown-session", id)).toThrowError(new RelayError("CLAIM_OWNER_REQUIRED"));
  });

  it("prioritizes cap exhaustion over missing active seed", () => {
    const relay = new InMemoryRelay();
    const theme = relay.listAdminThemes("ACTIVE")[0];
    for (let index = 0; index < 50; index += 1) {
      const chain = relay.seedChain("ru", theme.id);
      relay.start("ru", `cap-session-${index}`, randomUUID(), chain.publicCode);
    }
    relay.updateAdminTheme(theme.id, { status: "DRAFT" });
    expect(() => relay.start("ru", "cap-session", id)).toThrowError(new RelayError("NO_CHAIN_AVAILABLE"));

    const noSeedRelay = new InMemoryRelay({ themes: [{ id: "draft-theme", slug: "draft", title: "Draft", seedText: longText, status: "DRAFT" }] });
    expect(() => noSeedRelay.start("ru", "no-seed-session", id)).toThrowError(new RelayError("NO_ACTIVE_SEED"));
  });

  it("does not allow a thirteenth hop on a completed chain", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    for (let hop = 1; hop <= 12; hop += 1) {
      const session = `completed-${hop}`;
      const started = relay.start("ru", session, randomUUID(), chain.publicCode);
      relay.submit(started.claim.id, session, started.claim.claimToken!, randomUUID(), longText + ` completion ${hop}`);
    }
    expect(() => relay.start("ru", "thirteenth-session", randomUUID(), chain.publicCode)).toThrowError(new RelayError("CHAIN_COMPLETED"));
  });

  it("expires an abandoned claim before assigning a new one", () => {
    let current = new Date("2026-01-01T00:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => current });
    const chain = relay.seedChain("ru");
    const first = relay.start("ru", "session-a", id, chain.publicCode);
    current = new Date(current.getTime() + 181_000);
    const next = relay.start("ru", "session-b", id2, chain.publicCode);
    expect(next.claim.id).not.toBe(first.claim.id);
  });


  it("completes exactly after twelve accepted hops", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    for (let hop = 1; hop <= 12; hop += 1) {
      const session = "session-" + hop;
      const startKey = randomUUID();
      const submitKey = randomUUID();
      const started = relay.start("ru", session, startKey, chain.publicCode);
      relay.submit(
        started.claim.id,
        session,
        started.claim.claimToken!,
        submitKey,
        longText + " Шаг " + hop,
      );
    }
    const state = relay.getPublicState(chain.publicCode);
    expect(state.status).toBe("COMPLETED");
    expect(state.currentHop).toBe(12);
    expect(state.messages).toHaveLength(12);
    expect(state).toHaveProperty("seedText");
  });

  it("does not expose active seed or messages publicly", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const state = relay.getPublicState(chain.publicCode);
    expect(state.messages).toEqual([]);
    expect(state).not.toHaveProperty("seedText");
  });

  it("rotates and replays a lost claim token", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "session-a", id, chain.publicCode);
    const recoveryKey = "33333333-3333-4333-8333-333333333333";
    const recovered = relay.recover(chain.publicCode, "session-a", recoveryKey);
    expect(recovered.recovered).toBe(true);
    expect(recovered.replayed).toBe(false);
    expect(recovered.claim.claimToken).not.toBe(started.claim.claimToken);
    const replay = relay.recover(chain.publicCode, "session-a", recoveryKey);
    expect(replay.replayed).toBe(true);
    expect(replay.claim.claimToken).toBe(recovered.claim.claimToken);
  });

  it("does not recover a claim after its TTL", () => {
    let current = new Date("2026-01-01T00:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => current });
    const chain = relay.seedChain("ru");
    relay.start("ru", "session-a", id, chain.publicCode);
    current = new Date(current.getTime() + 181_000);
    expect(() => relay.recover(chain.publicCode, "session-a", "33333333-3333-4333-8333-333333333333")).toThrowError(
      new RelayError("CLAIM_EXPIRED"),
    );
  });

  it("accepts one report per session and reason on a completed chain", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    let firstMessageId = "";
    for (let hop = 1; hop <= 12; hop += 1) {
      const session = "report-session-" + hop;
      const started = relay.start("ru", session, randomUUID(), chain.publicCode);
      const submitted = relay.submit(
        started.claim.id,
        session,
        started.claim.claimToken!,
        randomUUID(),
        longText + " report step " + hop,
      );
      if (hop === 1) firstMessageId = submitted.message.id;
    }
    const first = relay.report(firstMessageId, "reporter", "PERSONAL_DATA", "Проверить текст");
    expect(first.report.status).toBe("OPEN");
    expect(() => relay.report(firstMessageId, "reporter", "PERSONAL_DATA", "Проверить текст")).toThrowError(
      new RelayError("REPORT_DUPLICATE"),
    );
  });

  it("supports admin theme lifecycle, chain pausing, and report resolution", () => {
    const relay = new InMemoryRelay();
    const theme = relay.createAdminTheme({
      slug: "admin-theme",
      titleRu: "Админская тема",
      titleEn: "Admin theme",
      seedTextRu: "Это достаточно длинный стартовый текст для административной темы.",
      seedTextEn: "This is a sufficiently long seed text for the administrative theme.",
      status: "ACTIVE",
    });
    expect(relay.listAdminThemes("ACTIVE").map((item) => item.slug)).toContain("admin-theme");
    const [summary] = relay.createAdminChains(theme.id, "ru", 1);
    expect(summary.status).toBe("ACTIVE");
    const paused = relay.pauseAdminChain(summary.publicCode);
    expect(paused.status).toBe("PAUSED");
    expect(() => relay.resumeAdminChain(summary.publicCode)).not.toThrow();
    expect(relay.archiveAdminChain(summary.publicCode).status).toBe("ARCHIVED");
    expect(() => relay.archiveAdminChain(summary.publicCode)).toThrowError(new RelayError("INVALID_STATE"));
  });

  it("closes open reports when an administrator archives their chain", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    let firstMessageId = "";
    for (let hop = 1; hop <= 12; hop += 1) {
      const session = "admin-report-session-" + hop;
      const started = relay.start("ru", session, randomUUID(), chain.publicCode);
      const submitted = relay.submit(started.claim.id, session, started.claim.claimToken!, randomUUID(), longText + " admin archive step " + hop);
      if (hop === 1) firstMessageId = submitted.message.id;
    }
    const created = relay.report(firstMessageId, "admin-report-owner", "ABUSE");
    const result = relay.archiveAdminReportChain(created.report.id);
    expect(result.chain.status).toBe("ARCHIVED");
    expect(result.report.status).toBe("CHAIN_ARCHIVED");
    expect(relay.listAdminReports("OPEN")).toHaveLength(0);
  });

  it("aggregates map activity with k-anonymity buckets", () => {
    let current = new Date("2026-01-01T12:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => current });
    const chain = relay.seedChain("ru");
    for (let hop = 1; hop <= 12; hop += 1) {
      const session = "map-session-" + hop;
      const started = relay.start("ru", session, randomUUID(), chain.publicCode);
      const country = hop <= 5 ? "FI" : hop <= 7 ? "DE" : null;
      relay.submit(started.claim.id, session, started.claim.claimToken!, randomUUID(), longText + " map step " + hop, country);
    }
    const map = relay.mapStats("all");
    expect(map.totalEvents).toBe(12);
    expect(map.countries).toContainEqual({ countryCode: "FI", count: 5 });
    expect(map.countries).toContainEqual({ countryCode: "OTHER", count: 2 });
    expect(map.countries).toContainEqual({ countryCode: "UNKNOWN", count: 5 });
  });

  it("keeps the all-time map period wider than the 24-hour window", () => {
    let current = new Date("2026-01-01T12:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => current });
    const chain = relay.seedChain("ru");
    for (let hop = 1; hop <= 12; hop += 1) {
      const session = "map-history-session-" + hop;
      const started = relay.start("ru", session, randomUUID(), chain.publicCode);
      relay.submit(started.claim.id, session, started.claim.claimToken!, randomUUID(), longText + " history step " + hop, "FI");
    }

    current = new Date("2027-01-03T12:00:00.000Z");

    expect(relay.mapStats("24h").totalEvents).toBe(0);
    expect(relay.mapStats("all").totalEvents).toBe(12);
  });

  it("maintenance expires claims and archives inactive chains", () => {
    let current = new Date("2026-01-01T00:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => current });
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "maintenance-session", randomUUID(), chain.publicCode);
    current = new Date(current.getTime() + 181_000);
    const expiry = relay.runMaintenance();
    expect(expiry.counts.expiredClaims).toBe(1);
    expect(started.claim.id).toBeTruthy();
    current = new Date(current.getTime() + 31 * 24 * 60 * 60 * 1000);
    const archival = relay.runMaintenance();
    expect(archival.counts.archivedChains).toBe(1);
    expect(relay.getPublicState(chain.publicCode).status).toBe("ARCHIVED");
  });
});
