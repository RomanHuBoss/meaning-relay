// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("../../lib/db/pool", () => ({
  getPool: () => ({ query: poolQuery }),
}));

import { POST as sessionPost } from "../../app/api/v1/session/route";
import { GET as csrfGet } from "../../app/api/v1/csrf/route";

const csrf = "c".repeat(43);
const sid = "s".repeat(43);

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: "GET", headers });
}

function sessionRequest(options: { cookie?: string; header?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.header !== undefined) headers["x-csrf-token"] = options.header;
  return new NextRequest("http://localhost/api/v1/session", { method: "POST", headers });
}

describe("контракты сессии и CSRF", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("создаёт новый CSRF-токен и не делает его HttpOnly", async () => {
    const response = await csrfGet(request("http://localhost/api/v1/csrf"));
    const body = await response.json() as { csrf: string };
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(cookie).toContain(`csrf=${body.csrf}`);
    expect(cookie).toMatch(/SameSite=lax/iu);
    expect(cookie).toContain("Max-Age=1800");
    expect(cookie).not.toContain("HttpOnly");
  });

  it("сохраняет корректный CSRF-токен и заменяет короткий токен", async () => {
    const preserved = await csrfGet(request("http://localhost/api/v1/csrf", { cookie: `csrf=${csrf}` }));
    expect(await preserved.json()).toEqual({ csrf });
    expect(preserved.headers.get("set-cookie")).toBeNull();

    const replaced = await csrfGet(request("http://localhost/api/v1/csrf", { cookie: "csrf=short" }));
    const body = await replaced.json() as { csrf: string };
    expect(body.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(body.csrf).not.toBe("short");
    expect(replaced.headers.get("set-cookie")).toContain(`csrf=${body.csrf}`);
  });

  it("отклоняет создание сессии без совпадающей CSRF-пары", async () => {
    const missing = await sessionPost(sessionRequest({ cookie: `sid=${sid}; csrf=${csrf}` }));
    expect(missing.status).toBe(403);
    expect((await missing.json()).error.code).toBe("CSRF_INVALID");
    expect(poolQuery).not.toHaveBeenCalled();

    const mismatched = await sessionPost(sessionRequest({ cookie: `sid=${sid}; csrf=${csrf}`, header: "x".repeat(43) }));
    expect(mismatched.status).toBe(403);
    expect((await mismatched.json()).error.code).toBe("CSRF_INVALID");
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("создаёт анонимную сессию с HttpOnly-cookie и безопасным сроком жизни", async () => {
    const response = await sessionPost(sessionRequest({ cookie: `csrf=${csrf}`, header: csrf }));
    const body = await response.json() as { session: { expires_at: string } };
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(201);
    expect(body.session.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(cookie).toContain("sid=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=lax/iu);
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("csrf=");
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("заменяет повреждённую sid-cookie и отправляет новый идентификатор", async () => {
    const response = await sessionPost(sessionRequest({ cookie: `sid=short; csrf=${csrf}`, header: csrf }));
    const cookie = response.headers.get("set-cookie") ?? "";
    const sidValue = cookie.match(/sid=([^;]+)/u)?.[1] ?? "";

    expect(response.status).toBe(201);
    expect(sidValue).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(sidValue).not.toBe("short");
  });

  it("сохраняет только производный идентификатор сессии при включённой базе", async () => {
    process.env.DATABASE_URL = "postgresql://session-test";
    poolQuery.mockResolvedValueOnce({ rows: [] });

    const response = await sessionPost(sessionRequest({ cookie: `sid=${sid}; csrf=${csrf}`, header: csrf }));
    expect(response.status).toBe(201);
    expect(poolQuery).toHaveBeenCalledOnce();
    const [query, values] = poolQuery.mock.calls[0] as [string, unknown[]];
    expect(query).toContain("INSERT INTO sessions (sid_hash, expires_at, last_seen_at)");
    expect(values[0]).toMatch(/^[0-9a-f]{64}$/u);
    // Сырой cookie никогда не должен попадать в запрос к базе.
    expect(values).not.toContain(sid);
  });
});
