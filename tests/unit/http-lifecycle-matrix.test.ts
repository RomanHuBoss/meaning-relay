// Этот тестовый модуль фиксирует общий порядок защиты HTTP-жизненного цикла:
// CSRF и тело запроса проверяются до доменной операции и ограничения частоты.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";
import { issueCaptcha } from "../../lib/http/captcha";

const fakeRuntime = vi.hoisted(() => ({
  start: vi.fn(),
  submit: vi.fn(),
  cancel: vi.fn(),
  recover: vi.fn(),
  report: vi.fn(),
}));
const fakeRate = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));
vi.mock("../../lib/http/rate-limit", () => fakeRate);

import { POST as startPost } from "../../app/api/v1/participation/start/route";
import { POST as submitPost } from "../../app/api/v1/claims/[claimId]/submit/route";
import { POST as cancelPost } from "../../app/api/v1/claims/[claimId]/cancel/route";
import { POST as recoverPost } from "../../app/api/v1/participation/recover/route";
import { POST as reportPost } from "../../app/api/v1/messages/[messageId]/reports/route";

const csrf = "c".repeat(43);
const sid = "s".repeat(43);
const startKey = "00000000-0000-4000-8000-000000000000";
const submitKey = "11111111-1111-4111-8111-111111111111";
const recoverKey = "22222222-2222-4222-8222-222222222222";
const limited = { allowed: false, retryAfterSeconds: 17, limit: 5, remaining: 0 };
const allowed = { allowed: true, retryAfterSeconds: 0, limit: 20, remaining: 19 };

function captchaFields(claimId = "claim"): { captcha_token: string; captcha_answer: string } {
  const issued = issueCaptcha(claimId, "ru");
  const payload = JSON.parse(Buffer.from(issued.token.split(".")[0], "base64url").toString("utf8")) as { a: number; b: number };
  return { captcha_token: issued.token, captcha_answer: String(payload.a + payload.b) };
}

function request(url: string, body: string, options: { session?: boolean; csrfHeader?: string } = {}): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("cookie", options.session === false ? `csrf=${csrf}` : `sid=${sid}; csrf=${csrf}`);
  headers.set("x-csrf-token", options.csrfHeader ?? csrf);
  return new NextRequest(url, { method: "POST", headers, body });
}

function newSessionRequest(url: string, body: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", csrf: "unused", cookie: `csrf=${csrf}`, "x-csrf-token": csrf }),
    body,
  });
}

describe("матрица защиты HTTP-жизненного цикла", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRate.consumeRateLimit.mockResolvedValue(allowed);
    fakeRate.rateLimitResponse.mockImplementation((result: typeof limited) => NextResponse.json(
      { error: { code: "RATE_LIMITED", retry_after_seconds: result.retryAfterSeconds } },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    ));
  });

  it("проверяет CSRF до старта, отправки и отмены claim", async () => {
    const start = await startPost(request("http://localhost/api/v1/participation/start", JSON.stringify({ language: "ru", public_code: null, idempotency_key: startKey }), { csrfHeader: "wrong" }));
    const submit = await submitPost(request("http://localhost/api/v1/claims/claim/submit", JSON.stringify({ claim_token: "token", idempotency_key: submitKey, text: "Достаточно длинный текст для проверки", country_code: null }), { csrfHeader: "wrong" }), { params: Promise.resolve({ claimId: "claim" }) });
    const cancel = await cancelPost(request("http://localhost/api/v1/claims/claim/cancel", "{}", { csrfHeader: "wrong" }), { params: Promise.resolve({ claimId: "claim" }) });

    expect(start.status).toBe(403);
    expect(submit.status).toBe(403);
    expect(cancel.status).toBe(403);
    expect(fakeRuntime.start).not.toHaveBeenCalled();
    expect(fakeRuntime.submit).not.toHaveBeenCalled();
    expect(fakeRuntime.cancel).not.toHaveBeenCalled();
  });

  it("возвращает SESSION_REQUIRED до проверки CSRF для recover", async () => {
    const response = await recoverPost(request("http://localhost/api/v1/participation/recover", JSON.stringify({ public_code: "123456789A", recover_idempotency_key: recoverKey }), { session: false, csrfHeader: "wrong" }));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("SESSION_REQUIRED");
    expect(fakeRuntime.recover).not.toHaveBeenCalled();
  });

  it("сохраняет анонимную cookie при ограничении старта и жалобы", async () => {
    fakeRate.consumeRateLimit.mockResolvedValue(limited);
    const start = await startPost(newSessionRequest("http://localhost/api/v1/participation/start", JSON.stringify({ language: "ru", public_code: null, idempotency_key: startKey })));
    const report = await reportPost(newSessionRequest("http://localhost/api/v1/messages/message/reports", JSON.stringify({ reason: "spam" })), { params: Promise.resolve({ messageId: "message" }) });

    expect(start.status).toBe(429);
    expect(start.headers.get("set-cookie")).toContain("sid=");
    expect(report.status).toBe(429);
    expect(report.headers.get("set-cookie")).toContain("sid=");
    expect(fakeRuntime.start).not.toHaveBeenCalled();
    expect(fakeRuntime.report).not.toHaveBeenCalled();
  });

  it("применяет ограничение отправки до обращения к relay", async () => {
    fakeRate.consumeRateLimit.mockResolvedValue(limited);
    const response = await submitPost(newSessionRequest("http://localhost/api/v1/claims/claim/submit", JSON.stringify({ claim_token: "token", idempotency_key: submitKey, text: "Достаточно длинный текст для проверки", country_code: null, ...captchaFields() })), { params: Promise.resolve({ claimId: "claim" }) });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect(fakeRuntime.submit).not.toHaveBeenCalled();
  });

  it.each([
    ["NO_CHAIN_AVAILABLE", 409],
    ["START_IDEMPOTENCY_REUSED", 409],
    ["CHAIN_COMPLETED", 409],
  ] as const)("maps start error %s to HTTP %i", async (code, status) => {
    fakeRuntime.start.mockRejectedValueOnce(new RelayError(code));
    const response = await startPost(request("http://localhost/api/v1/participation/start", JSON.stringify({ language: "ru", public_code: null, idempotency_key: startKey })));

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("maps submit token and owner failures without exposing runtime details", async () => {
    fakeRuntime.submit.mockRejectedValueOnce(new RelayError("CLAIM_TOKEN_INVALID"));
    const invalidToken = await submitPost(request("http://localhost/api/v1/claims/claim/submit", JSON.stringify({ claim_token: "wrong", idempotency_key: submitKey, text: "Достаточно длинный текст для проверки", country_code: null, ...captchaFields() })), { params: Promise.resolve({ claimId: "claim" }) });
    fakeRuntime.submit.mockRejectedValueOnce(new RelayError("CLAIM_OWNER_REQUIRED"));
    const wrongOwner = await submitPost(request("http://localhost/api/v1/claims/claim/submit", JSON.stringify({ claim_token: "token", idempotency_key: submitKey, text: "Достаточно длинный текст для проверки", country_code: null, ...captchaFields() })), { params: Promise.resolve({ claimId: "claim" }) });

    expect(invalidToken.status).toBe(403);
    expect(wrongOwner.status).toBe(403);
    expect((await invalidToken.json()).error.message).not.toContain("claim_token");
  });

  it("maps recover idempotency reuse and report not-found consistently", async () => {
    fakeRuntime.recover.mockRejectedValueOnce(new RelayError("RECOVERY_IDEMPOTENCY_REUSED"));
    const recovered = await recoverPost(request("http://localhost/api/v1/participation/recover", JSON.stringify({ public_code: "123456789A", recover_idempotency_key: recoverKey })));
    fakeRuntime.report.mockRejectedValueOnce(new RelayError("MESSAGE_NOT_FOUND"));
    const reported = await reportPost(request("http://localhost/api/v1/messages/missing/reports", JSON.stringify({ reason: "spam" })), { params: Promise.resolve({ messageId: "missing" }) });

    expect(recovered.status).toBe(409);
    expect((await recovered.json()).error.code).toBe("RECOVERY_IDEMPOTENCY_REUSED");
    expect(reported.status).toBe(404);
    expect((await reported.json()).error.code).toBe("MESSAGE_NOT_FOUND");
  });
});
