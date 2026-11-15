// Этот тестовый модуль закрепляет безопасные ответы терминальных HTTP-состояний.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({
  cancel: vi.fn(),
  recover: vi.fn(),
}));
const fakeRate = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));
vi.mock("../../lib/http/rate-limit", () => fakeRate);

import { POST as cancelPost } from "../../app/api/v1/claims/[claimId]/cancel/route";
import { POST as recoverPost } from "../../app/api/v1/participation/recover/route";

const csrf = "c".repeat(43);
const sid = "s".repeat(43);
const recoverKey = "22222222-2222-4222-8222-222222222222";

function request(url: string, body: string, options: { session?: boolean } = {}): NextRequest {
  const headers = new Headers({ "content-type": "application/json", "x-csrf-token": csrf });
  headers.set("cookie", options.session === false ? `csrf=${csrf}` : `sid=${sid}; csrf=${csrf}`);
  return new NextRequest(url, { method: "POST", headers, body });
}

async function errorBody(response: Response): Promise<{ code: string; request_id: string; retry_after_seconds: number }> {
  const body = await response.json() as { error: { code: string; request_id: string; retry_after_seconds: number } };
  return body.error;
}

describe("терминальная матрица HTTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRate.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, limit: 5, remaining: 4 });
  });

  it.each([
    ["CLAIM_NOT_FOUND", 404],
    ["CLAIM_OWNER_REQUIRED", 403],
    ["CLAIM_EXPIRED", 410],
    ["CLAIM_CANCELLED", 409],
    ["CLAIM_SUBMITTED", 409],
  ] as const)("возвращает безопасный ответ отмены для %s", async (code, status) => {
    fakeRuntime.cancel.mockRejectedValueOnce(new RelayError(code));

    const response = await cancelPost(
      request("http://localhost/api/v1/claims/claim-1/cancel", "{}"),
      { params: Promise.resolve({ claimId: "claim-1" }) },
    );
    const error = await errorBody(response);

    expect(response.status).toBe(status);
    expect(error).toMatchObject({ code, retry_after_seconds: 0 });
    expect(error.request_id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("передаёт отмену ровно выбранному claim и хешу текущей сессии", async () => {
    fakeRuntime.cancel.mockResolvedValueOnce(undefined);

    const response = await cancelPost(
      request("http://localhost/api/v1/claims/claim-7/cancel", "{}"),
      { params: Promise.resolve({ claimId: "claim-7" }) },
    );

    expect(response.status).toBe(204);
    expect(fakeRuntime.cancel).toHaveBeenCalledWith("claim-7", expect.stringMatching(/^[0-9a-f]{64}$/u));
  });

  it.each([
    ["CLAIM_OWNER_REQUIRED", 403],
    ["CLAIM_EXPIRED", 410],
    ["CLAIM_CANCELLED", 409],
    ["CLAIM_SUBMITTED", 409],
  ] as const)("сохраняет различие ошибок восстановления %s", async (code, status) => {
    fakeRuntime.recover.mockRejectedValueOnce(new RelayError(code));

    const response = await recoverPost(request("http://localhost/api/v1/participation/recover", JSON.stringify({
      public_code: "123456789A",
      recover_idempotency_key: recoverKey,
    })));
    const error = await errorBody(response);

    expect(response.status).toBe(status);
    expect(error).toMatchObject({ code, retry_after_seconds: 0 });
    expect(error.request_id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(fakeRate.consumeRateLimit).toHaveBeenCalledOnce();
  });

  it("не пытается восстановить участие без сессии даже при корректном CSRF", async () => {
    const response = await recoverPost(request(
      "http://localhost/api/v1/participation/recover",
      JSON.stringify({ public_code: "123456789A", recover_idempotency_key: recoverKey }),
      { session: false },
    ));

    const error = await errorBody(response);
    expect(response.status).toBe(401);
    expect(error).toMatchObject({ code: "SESSION_REQUIRED", retry_after_seconds: 0 });
    expect(error.request_id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(fakeRate.consumeRateLimit).not.toHaveBeenCalled();
    expect(fakeRuntime.recover).not.toHaveBeenCalled();
  });
});
