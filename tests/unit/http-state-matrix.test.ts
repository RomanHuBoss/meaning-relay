// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({
  cancel: vi.fn(),
  submit: vi.fn(),
  recover: vi.fn(),
  report: vi.fn(),
  getPublicState: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));

import { POST as cancelPost } from "../../app/api/v1/claims/[claimId]/cancel/route";
import { POST as submitPost } from "../../app/api/v1/claims/[claimId]/submit/route";
import { POST as recoverPost } from "../../app/api/v1/participation/recover/route";
import { POST as reportPost } from "../../app/api/v1/messages/[messageId]/reports/route";
import { GET as chainGet } from "../../app/api/v1/chains/[publicCode]/route";

const csrf = "c".repeat(43);
const sid = "s".repeat(43);
const publicCode = "123456789A";
const claimToken = "claim-token";
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const recoverKey = "22222222-2222-4222-8222-222222222222";

function postRequest(url: string, body: unknown, options: { session?: boolean; sidValue?: string } = {}): NextRequest {
  const headers = new Headers({ "content-type": "application/json", "x-csrf-token": csrf });
  headers.set("cookie", options.session === false ? `csrf=${csrf}` : `sid=${options.sidValue ?? sid}; csrf=${csrf}`);
  return new NextRequest(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
}

describe("HTTP terminal-state and public serialization matrix", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["CLAIM_CANCELLED", 409],
    ["CLAIM_EXPIRED", 410],
    ["CLAIM_NOT_FOUND", 404],
  ] as const)("maps cancel %s to HTTP %i", async (code, status) => {
    fakeRuntime.cancel.mockRejectedValueOnce(new RelayError(code));
    const response = await cancelPost(
      postRequest("http://localhost/api/v1/claims/claim/cancel", {}),
      { params: Promise.resolve({ claimId: "claim" }) },
    );
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it.each([
    ["CHAIN_PAUSED", 409],
    ["CHAIN_COMPLETED", 409],
    ["CHAIN_ARCHIVED", 410],
    ["CLAIM_EXPIRED", 410],
    ["CLAIM_CANCELLED", 409],
  ] as const)("maps submit %s to HTTP %i", async (code, status) => {
    fakeRuntime.submit.mockRejectedValueOnce(new RelayError(code));
    const response = await submitPost(
      postRequest("http://localhost/api/v1/claims/claim/submit", {
        claim_token: claimToken,
        idempotency_key: idempotencyKey,
        text: "Текст, достаточно длинный для прохождения минимальной длины.",
        country_code: null,
      }),
      { params: Promise.resolve({ claimId: "claim" }) },
    );
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it.each([
    ["CLAIM_CANCELLED", 409],
    ["CHAIN_PAUSED", 409],
    ["CHAIN_COMPLETED", 409],
    ["CHAIN_ARCHIVED", 410],
    ["CLAIM_EXPIRED", 410],
  ] as const)("maps recover %s to HTTP %i", async (code, status) => {
    fakeRuntime.recover.mockRejectedValueOnce(new RelayError(code));
    const response = await recoverPost(postRequest("http://localhost/api/v1/participation/recover", {
      public_code: publicCode,
      recover_idempotency_key: recoverKey,
    }));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("rejects malformed public and recovery idempotency keys before runtime", async () => {
    const publicCodeResponse = await recoverPost(postRequest("http://localhost/api/v1/participation/recover", {
      public_code: "not-a-code",
      recover_idempotency_key: recoverKey,
    }));
    expect(publicCodeResponse.status).toBe(400);
    expect((await publicCodeResponse.json()).error.code).toBe("INVALID_PUBLIC_CODE");

    fakeRuntime.recover.mockRejectedValueOnce(new RelayError("INVALID_RECOVER_IDEMPOTENCY_KEY"));
    const invalidKey = await recoverPost(postRequest("http://localhost/api/v1/participation/recover", {
      public_code: publicCode,
      recover_idempotency_key: "not-a-uuid",
    }, { sidValue: "t".repeat(43) }));
    expect(invalidKey.status).toBe(400);
    expect((await invalidKey.json()).error.code).toBe("INVALID_RECOVER_IDEMPOTENCY_KEY");
  });

  it("serializes hidden public messages with a placeholder while retaining source metrics", async () => {
    fakeRuntime.getPublicState.mockResolvedValueOnce({
      publicCode,
      language: "ru",
      status: "COMPLETED",
      currentHop: 12,
      targetHops: 12,
      themeTitle: "Тема",
      completedAt: new Date("2026-11-14T12:00:00.000Z"),
      seedText: "Исходная мысль о внимательном слушании",
      messages: [{
        id: "message-1",
        hopIndex: 1,
        text: "<script>alert(1)</script> Смысл сохранился",
        moderationStatus: "HIDDEN",
      }],
    });
    const response = await chainGet(new Request("http://localhost/api/v1/chains/123456789A"), { params: Promise.resolve({ publicCode }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages[0].text).toBe("[сообщение скрыто модератором]");
    expect(body.messages[0].text).not.toContain("script");
    expect(body.metrics.seed_character_count).toBeGreaterThan(0);
    expect(body.metrics.final_character_count).toBeGreaterThan(0);
  });

  it("serializes an open report response with its stable status", async () => {
    fakeRuntime.report.mockResolvedValueOnce({ report: { id: "report-1", status: "OPEN" } });
    const response = await reportPost(postRequest("http://localhost/api/v1/messages/message-1/reports", { reason: "spam" }), {
      params: Promise.resolve({ messageId: "message-1" }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ report: { id: "report-1", status: "OPEN" } });
  });
});
