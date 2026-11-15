// Этот тестовый модуль закрывает локальные HTTP-маршруты, которые не входят в основной поток участия.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fakeRuntime = vi.hoisted(() => ({
  stats: vi.fn(),
  adminCounters: vi.fn(),
  getAdminChain: vi.fn(),
}));
const fakeAdmin = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  revokeAdminSession: vi.fn(),
}));
const fakePool = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));
vi.mock("../../lib/db/pool", () => ({ getPool: () => fakePool }));
vi.mock("../../lib/http/admin", async () => {
  const actual = await vi.importActual<typeof import("../../lib/http/admin")>("../../lib/http/admin");
  return {
    ...actual,
    getAdminSession: fakeAdmin.getAdminSession,
    revokeAdminSession: fakeAdmin.revokeAdminSession,
  };
});

import { GET as publicHealthGet } from "../../app/api/health/route";
import { GET as databaseHealthGet } from "../../app/api/v1/health/route";
import { GET as dashboardGet } from "../../app/api/v1/admin/dashboard/route";
import { POST as logoutPost } from "../../app/api/v1/admin/logout/route";
import { GET as chainDetailGet } from "../../app/api/v1/admin/chains/[code]/route";

const csrf = "c".repeat(43);
const adminToken = "a".repeat(43);
const baseTime = new Date("2026-01-01T00:00:00.000Z");
const adminSession = { token: adminToken, tokenHash: "h".repeat(64), expiresAt: new Date(baseTime.getTime() + 28_800_000) };

function request(url: string, method = "GET", options: { admin?: boolean; csrfHeader?: string; csrfCookie?: string } = {}): NextRequest {
  const headers = new Headers();
  const cookies = [`csrf=${options.csrfCookie ?? csrf}`];
  if (options.admin !== false) cookies.push(`admin_sid=${adminToken}`);
  headers.set("cookie", cookies.join("; "));
  if (method !== "GET") headers.set("x-csrf-token", options.csrfHeader ?? csrf);
  return new NextRequest(url, { method, headers });
}

function adminChain() {
  return {
    publicCode: "ABC1234567",
    language: "ru" as const,
    themeTitle: "Тема",
    currentHop: 1,
    targetHops: 12,
    status: "ACTIVE" as const,
    lastActivityAt: baseTime,
    createdAt: baseTime,
    completedAt: null,
    seed: { text: "Начальный текст" },
    messages: [{ id: "message-1", hopIndex: 1, text: "Текст участника", moderationStatus: "ALLOWED" as const, createdAt: baseTime }],
  };
}

describe("локальное покрытие служебных HTTP-маршрутов", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
    fakeAdmin.getAdminSession.mockResolvedValue(adminSession);
    fakeAdmin.revokeAdminSession.mockResolvedValue(undefined);
    fakeRuntime.stats.mockResolvedValue({ activeChains: 2, completedChains: 3, savedMessages: 9, totalParticipants: 8, updatedAt: baseTime });
    fakeRuntime.adminCounters.mockReturnValue({ openReports: 4, errorsLast24h: 1 });
    fakeRuntime.getAdminChain.mockReturnValue(adminChain());
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("возвращает минимальный ответ корневого health-маршрута", async () => {
    const response = publicHealthGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "meaning-relay", version: "0.1.0" });
  });

  it("не требует базу для локального health-маршрута версии API", async () => {
    const response = await databaseHealthGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "not_configured" });
    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it("отказывает гостю до чтения административной статистики", async () => {
    fakeAdmin.getAdminSession.mockResolvedValueOnce(null);
    const response = await dashboardGet(request("http://localhost/api/v1/admin/dashboard", "GET", { admin: false }));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("ADMIN_REQUIRED");
    expect(fakeRuntime.stats).not.toHaveBeenCalled();
  });

  it("сериализует статистику и счётчики административной панели", async () => {
    const response = await dashboardGet(request("http://localhost/api/v1/admin/dashboard"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stats: { active_chains: 2, completed_chains: 3, saved_messages: 9, total_participants: 8, updated_at: baseTime.toISOString() },
      open_reports: 4,
      errors_last_24h: 1,
    });
  });

  it("возвращает безопасную ошибку панели без текста внутреннего исключения", async () => {
    fakeRuntime.stats.mockRejectedValueOnce(new Error("password=private-secret"));
    const response = await dashboardGet(request("http://localhost/api/v1/admin/dashboard"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR", message: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("private-secret");
  });

  it("очищает административную cookie при успешном выходе", async () => {
    const response = await logoutPost(request("http://localhost/api/v1/admin/logout", "POST"));

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/admin_sid=;.*Max-Age=0/iu);
    expect(fakeAdmin.revokeAdminSession).toHaveBeenCalledWith(adminToken);
  });

  it("очищает административную cookie даже при ошибке хранилища выхода", async () => {
    fakeAdmin.revokeAdminSession.mockRejectedValueOnce(new Error("database private-secret"));
    const response = await logoutPost(request("http://localhost/api/v1/admin/logout", "POST"));

    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toMatch(/admin_sid=;.*Max-Age=0/iu);
  });

  it("отклоняет выход без совпадающей CSRF-пары", async () => {
    const response = await logoutPost(request("http://localhost/api/v1/admin/logout", "POST", { csrfHeader: "wrong" }));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("CSRF_INVALID");
    expect(fakeAdmin.revokeAdminSession).not.toHaveBeenCalled();
  });

  it("сериализует административную цепочку по публичному коду", async () => {
    const response = await chainDetailGet(request("http://localhost/api/v1/admin/chains/ABC1234567"), { params: Promise.resolve({ code: "ABC1234567" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.chain).toMatchObject({ public_code: "ABC1234567", status: "ACTIVE", current_hop: 1, target_hops: 12 });
    expect(body.messages).toHaveLength(1);
  });
});
