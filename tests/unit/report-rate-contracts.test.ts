// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({ report: vi.fn() }));
const fakeRate = vi.hoisted(() => ({ consume: vi.fn() }));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));
vi.mock("../../lib/http/rate-limit", () => ({
  consumeRateLimit: fakeRate.consume,
  rateLimitResponse: (result: { retryAfterSeconds: number }) => NextResponse.json({
    error: {
      code: "RATE_LIMITED",
      message: "Rate limit exceeded",
      retry_after_seconds: result.retryAfterSeconds,
    },
  }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }),
}));

import { POST as reportPost } from "../../app/api/v1/messages/[messageId]/reports/route";

const csrf = "c".repeat(43);
const sid = "s".repeat(43);

function request(
  body: unknown,
  options: { session?: boolean; csrfHeader?: string } = {},
): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("cookie", options.session === false ? `csrf=${csrf}` : `sid=${sid}; csrf=${csrf}`);
  headers.set("x-csrf-token", options.csrfHeader ?? csrf);
  return new NextRequest("http://localhost/api/v1/messages/message-1/reports", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("report and rate-limit route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRate.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, limit: 5, remaining: 4 });
  });

  it("rejects non-object and unknown-field report bodies before rate limiting", async () => {
    const arrayBody = await reportPost(request([]), { params: Promise.resolve({ messageId: "message-1" }) });
    expect(arrayBody.status).toBe(422);
    expect((await arrayBody.json()).error.code).toBe("INVALID_BODY");

    const unknown = await reportPost(request({ reason: "spam", unexpected: true }), { params: Promise.resolve({ messageId: "message-1" }) });
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).error.code).toBe("INVALID_BODY");
    expect(fakeRate.consume).not.toHaveBeenCalled();
    expect(fakeRuntime.report).not.toHaveBeenCalled();
  });

  it("creates an anonymous session cookie after an allowed report", async () => {
    fakeRuntime.report.mockResolvedValueOnce({ report: { id: "report-1", status: "OPEN" } });
    const response = await reportPost(request({ reason: "personal_data", details: "  проверить  " }, { session: false }), { params: Promise.resolve({ messageId: "message-1" }) });

    expect(response.status).toBe(201);
    expect(fakeRate.consume).toHaveBeenCalledWith("REPORT", expect.any(String));
    expect(fakeRuntime.report).toHaveBeenCalledWith("message-1", expect.any(String), "PERSONAL_DATA", "  проверить  ");
    expect(response.headers.get("set-cookie")).toMatch(/sid=[A-Za-z0-9_-]{32,128}/u);
  });

  it("returns Retry-After and does not create a report when the bucket is exhausted", async () => {
    fakeRate.consume.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 37, limit: 5, remaining: 0 });
    const response = await reportPost(request({ reason: "spam" }, { session: false }), { params: Promise.resolve({ messageId: "message-1" }) });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect((await response.json()).error).toMatchObject({ code: "RATE_LIMITED", retry_after_seconds: 37 });
    expect(response.headers.get("set-cookie")).toMatch(/sid=[A-Za-z0-9_-]{32,128}/u);
    expect(fakeRuntime.report).not.toHaveBeenCalled();
  });

  it.each([
    ["REPORT_NOT_ALLOWED", 409],
    ["CHAIN_ARCHIVED", 410],
    ["MESSAGE_NOT_FOUND", 404],
  ] as const)("maps %s report state to HTTP %i", async (code, status) => {
    fakeRuntime.report.mockRejectedValueOnce(new RelayError(code));
    const response = await reportPost(request({ reason: "spam" }), { params: Promise.resolve({ messageId: "message-1" }) });

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
});
