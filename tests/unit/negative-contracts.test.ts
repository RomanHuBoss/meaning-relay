// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({
  cancel: vi.fn(),
  recover: vi.fn(),
  report: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));

import { POST as cancelPost } from "../../app/api/v1/claims/[claimId]/cancel/route";
import { POST as recoverPost } from "../../app/api/v1/participation/recover/route";
import { POST as reportPost } from "../../app/api/v1/messages/[messageId]/reports/route";
import { rateLimitResponse } from "../../lib/http/rate-limit";

const csrf = "c".repeat(43);

function request(url: string, body?: string, options: { session?: boolean; csrfHeader?: string } = {}): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.session !== false) headers.set("cookie", `sid=${"s".repeat(43)}; csrf=${csrf}`);
  if (options.csrfHeader !== undefined) headers.set("x-csrf-token", options.csrfHeader);
  return new NextRequest(url, { method: "POST", headers, body });
}

describe("negative HTTP contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancel rejects invalid CSRF and maps terminal submitted state", async () => {
    const invalidCsrf = await cancelPost(request("http://localhost/api/v1/claims/claim/cancel", "{}", { csrfHeader: "wrong" }), { params: Promise.resolve({ claimId: "claim" }) });
    expect(invalidCsrf.status).toBe(403);
    expect((await invalidCsrf.json()).error.code).toBe("CSRF_INVALID");

    fakeRuntime.cancel.mockRejectedValueOnce(new RelayError("CLAIM_SUBMITTED"));
    const submitted = await cancelPost(request("http://localhost/api/v1/claims/claim/cancel", "{}", { csrfHeader: csrf }), { params: Promise.resolve({ claimId: "claim" }) });
    expect(submitted.status).toBe(409);
    expect((await submitted.json()).error.code).toBe("CLAIM_SUBMITTED");
  });

  it("cancel returns 204 on success and session is not required in the body", async () => {
    fakeRuntime.cancel.mockResolvedValueOnce(undefined);
    const response = await cancelPost(request("http://localhost/api/v1/claims/claim/cancel", "{}", { csrfHeader: csrf }), { params: Promise.resolve({ claimId: "claim" }) });
    expect(response.status).toBe(204);
    expect(fakeRuntime.cancel).toHaveBeenCalledOnce();
  });

  it("recover rejects missing session, malformed JSON and unknown fields", async () => {
    const missingSession = await recoverPost(request("http://localhost/api/v1/participation/recover", "{}", { session: false, csrfHeader: csrf }));
    expect(missingSession.status).toBe(401);
    expect((await missingSession.json()).error.code).toBe("SESSION_REQUIRED");

    const malformed = await recoverPost(request("http://localhost/api/v1/participation/recover", "{", { csrfHeader: csrf }));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("INVALID_JSON");

    const unknown = await recoverPost(request("http://localhost/api/v1/participation/recover", JSON.stringify({ public_code: "123456789A", recover_idempotency_key: "00000000-0000-4000-8000-000000000000", extra: true }), { csrfHeader: csrf }));
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).error.code).toBe("INVALID_BODY");
  });

  it("recover maps cancelled and submitted claims to their distinct conflicts", async () => {
    fakeRuntime.recover.mockRejectedValueOnce(new RelayError("CLAIM_CANCELLED"));
    const cancelled = await recoverPost(request("http://localhost/api/v1/participation/recover", JSON.stringify({ public_code: "123456789A", recover_idempotency_key: "00000000-0000-4000-8000-000000000000" }), { csrfHeader: csrf }));
    expect(cancelled.status).toBe(409);
    expect((await cancelled.json()).error.code).toBe("CLAIM_CANCELLED");

    fakeRuntime.recover.mockRejectedValueOnce(new RelayError("CLAIM_SUBMITTED"));
    const submitted = await recoverPost(request("http://localhost/api/v1/participation/recover", JSON.stringify({ public_code: "123456789A", recover_idempotency_key: "11111111-1111-4111-8111-111111111111" }), { csrfHeader: csrf }));
    expect(submitted.status).toBe(409);
    expect((await submitted.json()).error.code).toBe("CLAIM_SUBMITTED");
  });

  it("report validates JSON, reason and details before calling the relay", async () => {
    const malformed = await reportPost(request("http://localhost/api/v1/messages/message/reports", "{", { csrfHeader: csrf }), { params: Promise.resolve({ messageId: "message" }) });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("INVALID_JSON");

    const reason = await reportPost(request("http://localhost/api/v1/messages/message/reports", JSON.stringify({ reason: "not-a-reason" }), { csrfHeader: csrf }), { params: Promise.resolve({ messageId: "message" }) });
    expect(reason.status).toBe(422);
    expect((await reason.json()).error.code).toBe("INVALID_REPORT_REASON");

    const details = await reportPost(request("http://localhost/api/v1/messages/message/reports", JSON.stringify({ reason: "spam", details: "x".repeat(301) }), { csrfHeader: csrf }), { params: Promise.resolve({ messageId: "message" }) });
    expect(details.status).toBe(422);
    expect((await details.json()).error.code).toBe("INVALID_BODY");
    expect(fakeRuntime.report).not.toHaveBeenCalled();
  });

  it("maps duplicate report and exposes the retry header for rate limits", async () => {
    fakeRuntime.report.mockRejectedValueOnce(new RelayError("REPORT_DUPLICATE"));
    const duplicate = await reportPost(request("http://localhost/api/v1/messages/message/reports", JSON.stringify({ reason: "spam" }), { csrfHeader: csrf }), { params: Promise.resolve({ messageId: "message" }) });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe("REPORT_DUPLICATE");

    const limited = rateLimitResponse({ allowed: false, retryAfterSeconds: 42, limit: 5, remaining: 0 });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("42");
    expect((await limited.json()).error).toMatchObject({ code: "RATE_LIMITED", retry_after_seconds: 42 });
  });
});
