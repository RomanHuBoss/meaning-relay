// Этот тестовый модуль фиксирует границы административного входа и не даёт
// ошибочному телу запроса попасть в создание защищённой сессии.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fakeAdmin = vi.hoisted(() => ({
  adminKeyMatches: vi.fn(),
  adminScopeHash: vi.fn(),
  createAdminSession: vi.fn(),
}));
const fakeRate = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
}));

vi.mock("../../lib/http/admin", async () => {
  const actual = await vi.importActual<typeof import("../../lib/http/admin")>("../../lib/http/admin");
  return { ...actual, ...fakeAdmin };
});
vi.mock("../../lib/http/rate-limit", () => fakeRate);

import { POST as loginPost } from "../../app/api/v1/admin/login/route";

const csrf = "c".repeat(43);
const adminKey = "correct-admin-key";

function request(body: string, options: { csrfHeader?: string } = {}): NextRequest {
  const headers = new Headers({
    "content-type": "application/json",
    cookie: `csrf=${csrf}`,
    "x-csrf-token": options.csrfHeader ?? csrf,
  });
  return new NextRequest("http://localhost/api/v1/admin/login", { method: "POST", headers, body });
}

describe("матрица ошибок административного входа", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRate.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0, limit: 5, remaining: 4 });
    fakeAdmin.adminScopeHash.mockReturnValue("scope-hash");
    fakeAdmin.adminKeyMatches.mockReturnValue(false);
  });

  it("отклоняет неверный CSRF до обращения к счётчику попыток", async () => {
    const response = await loginPost(request(JSON.stringify({ admin_key: adminKey }), { csrfHeader: "wrong" }));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("CSRF_INVALID");
    expect(fakeRate.consumeRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ["{", "INVALID_JSON", 400],
    ["[]", "INVALID_BODY", 422],
    [JSON.stringify({}), "INVALID_BODY", 422],
    [JSON.stringify({ admin_key: adminKey, extra: true }), "INVALID_BODY", 422],
  ] as const)("отклоняет тело %s как %s", async (body, code, status) => {
    const response = await loginPost(request(body));

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(fakeAdmin.adminKeyMatches).not.toHaveBeenCalled();
    expect(fakeAdmin.createAdminSession).not.toHaveBeenCalled();
  });

  it("возвращает 401 для неверного ключа без создания сессии", async () => {
    const response = await loginPost(request(JSON.stringify({ admin_key: "wrong" })));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("ADMIN_INVALID_KEY");
    expect(fakeAdmin.adminKeyMatches).toHaveBeenCalledWith("wrong");
    expect(fakeAdmin.createAdminSession).not.toHaveBeenCalled();
  });

  it("возвращает 429 с Retry-After при исчерпании лимита", async () => {
    fakeRate.consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 61, limit: 5, remaining: 0 });
    fakeRate.rateLimitResponse.mockReturnValueOnce(new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "61" },
    }));

    const response = await loginPost(request(JSON.stringify({ admin_key: adminKey })));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("61");
    expect(fakeAdmin.adminKeyMatches).not.toHaveBeenCalled();
  });

  it("создаёт административную сессию только после успешной проверки ключа", async () => {
    fakeAdmin.adminKeyMatches.mockReturnValueOnce(true);
    const expiresAt = new Date("2026-11-14T16:00:00.000Z");
    fakeAdmin.createAdminSession.mockResolvedValueOnce({ token: "t".repeat(43), expiresAt });

    const response = await loginPost(request(JSON.stringify({ admin_key: adminKey })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ admin: { expires_at: expiresAt.toISOString() } });
    expect(fakeAdmin.createAdminSession).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain("admin_sid=");
  });
});
