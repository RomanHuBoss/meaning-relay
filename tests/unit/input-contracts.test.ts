// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({
  start: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));

import { POST as startPost } from "../../app/api/v1/participation/start/route";
import { POST as submitPost } from "../../app/api/v1/claims/[claimId]/submit/route";

const csrf = "c".repeat(43);
const session = "s".repeat(43);
const startKey = "00000000-0000-4000-8000-000000000000";
const submitKey = "11111111-1111-4111-8111-111111111111";

function request(
  url: string,
  body: string,
  options: { session?: boolean; csrfHeader?: string } = {},
): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("cookie", options.session === false ? `csrf=${csrf}` : `sid=${session}; csrf=${csrf}`);
  headers.set("x-csrf-token", options.csrfHeader ?? csrf);
  return new NextRequest(url, { method: "POST", headers, body });
}

describe("start and submit input contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed JSON before starting participation", async () => {
    const response = await startPost(request("http://localhost/api/v1/participation/start", "{"));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_JSON");
    expect(fakeRuntime.start).not.toHaveBeenCalled();
  });

  it("rejects unknown fields and invalid public codes at the start boundary", async () => {
    const unknown = await startPost(request(
      "http://localhost/api/v1/participation/start",
      JSON.stringify({ language: "ru", public_code: null, idempotency_key: startKey, extra: true }),
    ));
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).error.code).toBe("INVALID_BODY");

    const malformedCode = await startPost(request(
      "http://localhost/api/v1/participation/start",
      JSON.stringify({ language: "ru", public_code: "0-not-a-code", idempotency_key: startKey }),
    ));
    expect(malformedCode.status).toBe(400);
    expect((await malformedCode.json()).error.code).toBe("INVALID_PUBLIC_CODE");
    expect(fakeRuntime.start).not.toHaveBeenCalled();
  });

  it("maps invalid start idempotency keys without leaking runtime details", async () => {
    fakeRuntime.start.mockRejectedValueOnce(new RelayError("INVALID_IDEMPOTENCY_KEY"));

    const response = await startPost(request(
      "http://localhost/api/v1/participation/start",
      JSON.stringify({ language: "ru", public_code: null, idempotency_key: "not-a-uuid" }),
    ));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_IDEMPOTENCY_KEY");
    expect(fakeRuntime.start).toHaveBeenCalledWith("ru", expect.any(String), "not-a-uuid", null);
  });

  it("rejects malformed submit bodies before calling the relay", async () => {
    const malformed = await submitPost(
      request("http://localhost/api/v1/claims/claim/submit", "{"),
      { params: Promise.resolve({ claimId: "claim" }) },
    );
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("INVALID_JSON");

    const missing = await submitPost(
      request("http://localhost/api/v1/claims/claim/submit", JSON.stringify({ claim_token: "token" })),
      { params: Promise.resolve({ claimId: "claim" }) },
    );
    expect(missing.status).toBe(422);
    expect((await missing.json()).error.code).toBe("INVALID_BODY");

    const unknown = await submitPost(
      request(
        "http://localhost/api/v1/claims/claim/submit",
        JSON.stringify({ claim_token: "token", idempotency_key: submitKey, text: "valid text", country_code: null, extra: true }),
      ),
      { params: Promise.resolve({ claimId: "claim" }) },
    );
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).error.code).toBe("INVALID_BODY");
    expect(fakeRuntime.submit).not.toHaveBeenCalled();
  });

  it("keeps a submit without a valid session from reaching a claim", async () => {
    fakeRuntime.submit.mockRejectedValueOnce(new RelayError("CLAIM_OWNER_REQUIRED"));

    const response = await submitPost(
      request(
        "http://localhost/api/v1/claims/claim/submit",
        JSON.stringify({ claim_token: "token", idempotency_key: submitKey, text: "valid text", country_code: null }),
        { session: false },
      ),
      { params: Promise.resolve({ claimId: "claim" }) },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("CLAIM_OWNER_REQUIRED");
    expect(fakeRuntime.submit).toHaveBeenCalledWith(
      "claim",
      expect.any(String),
      "token",
      submitKey,
      "valid text",
      null,
    );
  });

  it("maps the ISO country allowlist rejection to a generic client error", async () => {
    fakeRuntime.submit.mockRejectedValueOnce(new RelayError("INVALID_COUNTRY_CODE"));

    const response = await submitPost(
      request(
        "http://localhost/api/v1/claims/claim/submit",
        JSON.stringify({ claim_token: "token", idempotency_key: submitKey, text: "valid text", country_code: "ZZ" }),
      ),
      { params: Promise.resolve({ claimId: "claim" }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_COUNTRY_CODE");
  });
});
