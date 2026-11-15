// Этот тестовый модуль проверяет границы JSON-маршрутов до обращения к доменной модели.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const fakeRuntime = vi.hoisted(() => ({
  start: vi.fn(),
  submit: vi.fn(),
  recover: vi.fn(),
  report: vi.fn(),
}));
const fakeRate = vi.hoisted(() => ({ consumeRateLimit: vi.fn() }));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));
vi.mock("../../lib/http/rate-limit", () => ({
  consumeRateLimit: fakeRate.consumeRateLimit,
  rateLimitResponse: (result: { retryAfterSeconds: number }) => NextResponse.json(
    { error: { code: "RATE_LIMITED", retry_after_seconds: result.retryAfterSeconds } },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  ),
}));

import { POST as startPost } from "../../app/api/v1/participation/start/route";
import { POST as submitPost } from "../../app/api/v1/claims/[claimId]/submit/route";
import { POST as recoverPost } from "../../app/api/v1/participation/recover/route";
import { POST as reportPost } from "../../app/api/v1/messages/[messageId]/reports/route";

const csrf = "c".repeat(43);
const sid = "s".repeat(43);
const startKey = "00000000-0000-4000-8000-000000000000";
const submitKey = "11111111-1111-4111-8111-111111111111";
const recoverKey = "22222222-2222-4222-8222-222222222222";
const publicCode = "123456789A";
const validText = "Достаточно длинный текст для проверки HTTP-контракта.";

function request(url: string, body: unknown, options: { session?: boolean; raw?: boolean } = {}): NextRequest {
  const headers = new Headers({ "content-type": "application/json", "x-csrf-token": csrf });
  headers.set("cookie", options.session === false ? `csrf=${csrf}` : `sid=${sid}; csrf=${csrf}`);
  const payload = options.raw ? String(body) : JSON.stringify(body);
  return new NextRequest(url, { method: "POST", headers, body: payload });
}

describe("матрица JSON-тел HTTP-маршрутов", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRate.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, limit: 20, remaining: 19 });
  });

  it.each([
    ["null", "INVALID_BODY", 422],
    ["[]", "INVALID_BODY", 422],
    [JSON.stringify({ language: "ru", idempotency_key: startKey }), "INVALID_BODY", 422],
    [JSON.stringify({ language: "de", public_code: null, idempotency_key: startKey }), "INVALID_LANGUAGE", 400],
    [JSON.stringify({ language: "ru", public_code: null, idempotency_key: 7 }), "INVALID_BODY", 422],
    [JSON.stringify({ language: "ru", public_code: 7, idempotency_key: startKey }), "INVALID_BODY", 422],
    [JSON.stringify({ language: "ru", public_code: null, exclude_public_code: 7, idempotency_key: startKey }), "INVALID_BODY", 422],
    [JSON.stringify({ language: "ru", public_code: null, exclude_public_code: "0-invalid", idempotency_key: startKey }), "INVALID_PUBLIC_CODE", 400],
  ] as const)("отклоняет тело старта %s до вызова relay", async (body, code, status) => {
    const response = await startPost(request("http://localhost/api/v1/participation/start", body, { raw: true }));

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(fakeRuntime.start).not.toHaveBeenCalled();
    expect(fakeRate.consumeRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ["null", "INVALID_BODY", 422],
    ["[]", "INVALID_BODY", 422],
    [JSON.stringify({ claim_token: "token", idempotency_key: submitKey, text: validText }), "INVALID_BODY", 422],
    [JSON.stringify({ claim_token: 7, idempotency_key: submitKey, text: validText, country_code: null }), "INVALID_BODY", 422],
    [JSON.stringify({ claim_token: "token", idempotency_key: submitKey, text: validText, country_code: 7 }), "INVALID_BODY", 422],
  ] as const)("отклоняет тело отправки %s до вызова relay", async (body, code, status) => {
    const response = await submitPost(
      request("http://localhost/api/v1/claims/claim-1/submit", body, { raw: true }),
      { params: Promise.resolve({ claimId: "claim-1" }) },
    );

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(fakeRuntime.submit).not.toHaveBeenCalled();
    expect(fakeRate.consumeRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ["{", "INVALID_JSON", 400],
    ["[]", "INVALID_BODY", 422],
    [JSON.stringify({ public_code: publicCode }), "INVALID_BODY", 422],
    [JSON.stringify({ public_code: 7, recover_idempotency_key: recoverKey }), "INVALID_PUBLIC_CODE", 400],
    [JSON.stringify({ public_code: publicCode, recover_idempotency_key: 7 }), "INVALID_BODY", 422],
    [JSON.stringify({ public_code: publicCode, recover_idempotency_key: recoverKey, extra: true }), "INVALID_BODY", 422],
  ] as const)("отклоняет тело восстановления %s до вызова relay", async (body, code, status) => {
    const response = await recoverPost(request("http://localhost/api/v1/participation/recover", body, { raw: true }));

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(fakeRuntime.recover).not.toHaveBeenCalled();
    expect(fakeRate.consumeRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ["{", "INVALID_JSON", 400],
    ["[]", "INVALID_BODY", 422],
    [JSON.stringify({}), "INVALID_BODY", 422],
    [JSON.stringify({ reason: 7 }), "INVALID_BODY", 422],
    [JSON.stringify({ reason: "unknown" }), "INVALID_REPORT_REASON", 422],
    [JSON.stringify({ reason: "spam", details: "   " }), "INVALID_BODY", 422],
    [JSON.stringify({ reason: "spam", details: 7 }), "INVALID_BODY", 422],
    [JSON.stringify({ reason: "spam", details: "x".repeat(301) }), "INVALID_BODY", 422],
  ] as const)("отклоняет тело жалобы %s до вызова relay", async (body, code, status) => {
    const response = await reportPost(
      request("http://localhost/api/v1/messages/message-1/reports", body, { raw: true }),
      { params: Promise.resolve({ messageId: "message-1" }) },
    );

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(fakeRuntime.report).not.toHaveBeenCalled();
    expect(fakeRate.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("не принимает тело восстановления без cookie сессии даже при корректном JSON", async () => {
    const response = await recoverPost(request(
      "http://localhost/api/v1/participation/recover",
      { public_code: publicCode, recover_idempotency_key: recoverKey },
      { session: false },
    ));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("SESSION_REQUIRED");
    expect(fakeRuntime.recover).not.toHaveBeenCalled();
  });
});
