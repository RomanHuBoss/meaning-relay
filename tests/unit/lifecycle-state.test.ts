// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { InMemoryRelay } from "../../lib/relay/in-memory";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({ report: vi.fn() }));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));

import { POST as reportPost } from "../../app/api/v1/messages/[messageId]/reports/route";

const startKey = "11111111-1111-4111-8111-111111111111";
const submitKey = "22222222-2222-4222-8222-222222222222";
const longText = "Это достаточно длинный пересказ, который проходит минимальные ограничения и меняет исходную формулировку.";
const csrf = "c".repeat(43);

function completeChain(relay: InMemoryRelay, language = "ru" as const, prefix = "lifecycle", country?: string): string {
  const chain = relay.seedChain(language);
  let firstMessageId = "";
  for (let hop = 1; hop <= 12; hop += 1) {
    const session = `${prefix}-${hop}`;
    const started = relay.start(language, session, `${hop.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`, chain.publicCode);
    const submitted = relay.submit(
      started.claim.id,
      session,
      started.claim.claimToken!,
      `${(hop + 20).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
      `${longText} ${prefix} ${hop}`,
      country,
    );
    if (hop === 1) firstMessageId = submitted.message.id;
  }
  return firstMessageId;
}

function reportRequest(messageId: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/messages/${messageId}/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `csrf=${csrf}`,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ reason: "spam" }),
  });
}

describe("relay lifecycle state contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows at most one active claim and one submitted message per session and chain", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const first = relay.start("ru", "same-session", startKey, chain.publicCode);

    expect(() => relay.start("ru", "same-session", submitKey, chain.publicCode)).toThrowError(
      new RelayError("SESSION_HAS_ACTIVE_CLAIM"),
    );

    relay.submit(first.claim.id, "same-session", first.claim.claimToken!, submitKey, longText);
    expect(() => relay.start("ru", "same-session", "33333333-3333-4333-8333-333333333333", chain.publicCode)).toThrowError(
      new RelayError("SESSION_ALREADY_PARTICIPATED"),
    );
  });

  it("keeps a chain theme and seed snapshot immutable after theme edits", () => {
    const relay = new InMemoryRelay();
    const theme = relay.listAdminThemes("ACTIVE")[0];
    const chain = relay.seedChain("ru", theme.id);
    const before = relay.getAdminChain(chain.publicCode);

    relay.updateAdminTheme(theme.id, {
      titleRu: "Новое название",
      seedTextRu: "Новый текст темы, который не должен переписать уже созданную цепочку.",
    });

    const after = relay.getAdminChain(chain.publicCode);
    expect(after.themeTitle).toBe(before.themeTitle);
    expect(after.seed.text).toBe(before.seed.text);
  });

  it("exposes only completed content while paused and archived states remain redacted", () => {
    const pausedRelay = new InMemoryRelay();
    const paused = pausedRelay.seedChain("ru");
    pausedRelay.start("ru", "paused-session", startKey, paused.publicCode);
    pausedRelay.pauseAdminChain(paused.publicCode);
    const pausedState = pausedRelay.getPublicState(paused.publicCode);
    expect(pausedState.status).toBe("PAUSED");
    expect(pausedState.messages).toEqual([]);
    expect(pausedState).not.toHaveProperty("seedText");

    const archivedRelay = new InMemoryRelay();
    const archived = archivedRelay.seedChain("ru");
    archivedRelay.archiveAdminChain(archived.publicCode);
    const archivedState = archivedRelay.getPublicState(archived.publicCode);
    expect(archivedState.status).toBe("ARCHIVED");
    expect(archivedState.messages).toEqual([]);
    expect(archivedState).not.toHaveProperty("seedText");

    const completedRelay = new InMemoryRelay();
    const firstMessageId = completeChain(completedRelay, "ru", "completed");
    const completedState = completedRelay.getPublicState(
      completedRelay.listAdminChains({ status: "COMPLETED" })[0].publicCode,
    );
    expect(firstMessageId).toBeTruthy();
    expect(completedState.status).toBe("COMPLETED");
    expect("seedText" in completedState).toBe(true);
    if ("seedText" in completedState) {
      expect(completedState.seedText).toBeTruthy();
      expect(completedState.messages).toHaveLength(12);
    }
  });

  it("keeps recover errors distinct across cancelled, paused, archived and completed states", () => {
    const cancelledRelay = new InMemoryRelay();
    const cancelled = cancelledRelay.seedChain("ru");
    const claim = cancelledRelay.start("ru", "cancelled", startKey, cancelled.publicCode);
    cancelledRelay.cancel(claim.claim.id, "cancelled");
    expect(() => cancelledRelay.recover(cancelled.publicCode, "cancelled", submitKey)).toThrowError(new RelayError("CLAIM_CANCELLED"));

    const pausedRelay = new InMemoryRelay();
    const paused = pausedRelay.seedChain("ru");
    pausedRelay.pauseAdminChain(paused.publicCode);
    expect(() => pausedRelay.recover(paused.publicCode, "missing", startKey)).toThrowError(new RelayError("CHAIN_PAUSED"));

    const archivedRelay = new InMemoryRelay();
    const archived = archivedRelay.seedChain("ru");
    archivedRelay.archiveAdminChain(archived.publicCode);
    expect(() => archivedRelay.recover(archived.publicCode, "missing", startKey)).toThrowError(new RelayError("CHAIN_ARCHIVED"));

    const completedRelay = new InMemoryRelay();
    const completed = completedRelay.seedChain("ru");
    completeChainFor(completedRelay, completed.publicCode, "completed-recover");
    expect(() => completedRelay.recover(completed.publicCode, "missing", startKey)).toThrowError(new RelayError("CHAIN_COMPLETED"));
  });

  it("rejects invite participation after the same session already submitted a message", () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "participant", startKey, chain.publicCode);
    relay.submit(started.claim.id, "participant", started.claim.claimToken!, submitKey, longText);
    expect(() => relay.start("ru", "participant", "33333333-3333-4333-8333-333333333333", chain.publicCode)).toThrowError(
      new RelayError("SESSION_ALREADY_PARTICIPATED"),
    );
  });

  it("allows reports only on completed chains and closes them on archive", () => {
    const activeRelay = new InMemoryRelay();
    const active = activeRelay.seedChain("ru");
    const activeClaim = activeRelay.start("ru", "active-report", startKey, active.publicCode);
    const activeMessage = activeRelay.submit(activeClaim.claim.id, "active-report", activeClaim.claim.claimToken!, submitKey, longText).message;
    expect(() => activeRelay.report(activeMessage.id, "reporter", "SPAM")).toThrowError(new RelayError("REPORT_NOT_ALLOWED"));

    const completedRelay = new InMemoryRelay();
    const firstMessageId = completeChain(completedRelay, "ru", "reported");
    const created = completedRelay.report(firstMessageId, "reporter", "SPAM");
    expect(created.report.status).toBe("OPEN");
    const archived = completedRelay.archiveAdminReportChain(created.report.id);
    expect(archived.report.status).toBe("CHAIN_ARCHIVED");
    expect(completedRelay.listAdminReports("OPEN")).toHaveLength(0);
    expect(completedRelay.listAdminReports("CHAIN_ARCHIVED")).toHaveLength(1);
  });

  it("counts hidden messages and their country events without exposing original text through moderation state", () => {
    const relay = new InMemoryRelay();
    const firstMessageId = completeChain(relay, "ru", "hidden", "FI");
    const original = relay.getAdminChain(relay.listAdminChains({ status: "COMPLETED" })[0].publicCode).messages[0].text;
    const report = relay.report(firstMessageId, "moderator", "PERSONAL_DATA");
    const hidden = relay.hideAdminReportMessage(report.report.id);
    expect(hidden.message.moderationStatus).toBe("HIDDEN");

    const state = relay.getPublicState(relay.listAdminChains({ status: "COMPLETED" })[0].publicCode);
    expect(state.messages[0].moderationStatus).toBe("HIDDEN");
    expect(state.messages[0].text).toBe(original);
    expect(relay.stats().savedMessages).toBe(12);
    expect(relay.mapStats("all").totalEvents).toBe(12);
  });

  it("creates a session cookie for an anonymous HTTP report", async () => {
    fakeRuntime.report.mockResolvedValueOnce({ report: { id: "report-1", status: "OPEN" } });
    const response = await reportPost(reportRequest("message-1"), { params: Promise.resolve({ messageId: "message-1" }) });

    expect(response.status).toBe(201);
    expect(fakeRuntime.report).toHaveBeenCalledWith("message-1", expect.any(String), "SPAM", undefined);
    expect(response.headers.get("set-cookie")).toMatch(/sid=[A-Za-z0-9_-]{32,128}/u);
  });
});

function completeChainFor(relay: InMemoryRelay, publicCode: string, prefix: string): void {
  for (let hop = 1; hop <= 12; hop += 1) {
    const session = `${prefix}-${hop}`;
    const started = relay.start("ru", session, `${(hop + 30).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`, publicCode);
    relay.submit(
      started.claim.id,
      session,
      started.claim.claimToken!,
      `${(hop + 50).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
      `${longText} ${prefix} ${hop}`,
    );
  }
}
