// Этот тестовый модуль закрепляет фильтры, пагинацию и безопасную выдачу административных списков.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fakeRuntime = vi.hoisted(() => ({
  listAdminThemes: vi.fn(),
  listAdminChains: vi.fn(),
  listAdminReports: vi.fn(),
}));

const fakeAdmin = vi.hoisted(() => ({ getAdminSession: vi.fn() }));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));
vi.mock("../../lib/http/admin", async () => {
  const actual = await vi.importActual<typeof import("../../lib/http/admin")>("../../lib/http/admin");
  return { ...actual, getAdminSession: fakeAdmin.getAdminSession };
});

import { GET as themesGet } from "../../app/api/v1/admin/themes/route";
import { GET as chainsGet } from "../../app/api/v1/admin/chains/route";
import { GET as reportsGet } from "../../app/api/v1/admin/reports/route";

const adminToken = "a".repeat(43);
const baseTime = new Date("2026-01-01T00:00:00.000Z");

function request(url: string): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: { cookie: `admin_sid=${adminToken}` },
  });
}

function theme(id: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
  return {
    id,
    slug: `theme-${id}`,
    titleRu: "Тема",
    titleEn: "Theme",
    seedTextRu: "Исходный текст на русском языке.",
    seedTextEn: "An English seed text.",
    status,
    createdAt: baseTime,
    updatedAt: baseTime,
    sessionHash: "не должен попасть в ответ",
  };
}

function chain(code: string, language: "ru" | "en" = "ru") {
  return {
    publicCode: code,
    language,
    themeTitle: "Тема",
    currentHop: 4,
    targetHops: 12,
    status: "ACTIVE" as const,
    lastActivityAt: baseTime,
    createdAt: baseTime,
    completedAt: null,
    sessionHash: "не должен попасть в ответ",
  };
}

function report(id: string, status: "OPEN" | "DISMISSED" | "HIDDEN" | "CHAIN_ARCHIVED" = "OPEN") {
  return {
    id,
    status,
    reason: "SPAM" as const,
    details: "Подробности",
    createdAt: baseTime,
    resolvedAt: status === "OPEN" ? null : baseTime,
    message: {
      id: `message-${id}`,
      chainPublicCode: "ABC1234567",
      hopIndex: 2,
      text: "Текст сообщения",
      moderationStatus: "ALLOWED" as const,
      sessionHash: "не должен попасть в ответ",
    },
    chain: { publicCode: "ABC1234567", status: "COMPLETED" as const },
    reporterHash: "не должен попасть в ответ",
  };
}

describe("матрица административных списков", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin.getAdminSession.mockResolvedValue({
      token: adminToken,
      tokenHash: "h".repeat(64),
      expiresAt: new Date(baseTime.getTime() + 28_800_000),
    });
  });

  it("передаёт фильтры тем и ограничивает размер страницы", async () => {
    fakeRuntime.listAdminThemes.mockReturnValueOnce([theme("one"), theme("two")]);

    const response = await themesGet(request("http://localhost/api/v1/admin/themes?status=ACTIVE&limit=50"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fakeRuntime.listAdminThemes).toHaveBeenCalledWith("ACTIVE");
    expect(body.themes).toHaveLength(2);
    expect(body.themes[0]).not.toHaveProperty("sessionHash");
    expect(body.themes[0]).toMatchObject({ id: "one", status: "ACTIVE", created_at: baseTime.toISOString() });
    expect(body.next_cursor).toBeNull();
  });

  it("передаёт языковой и статусный фильтры списка цепочек", async () => {
    fakeRuntime.listAdminChains.mockReturnValueOnce([chain("ABC1234567", "en")]);

    const response = await chainsGet(request("http://localhost/api/v1/admin/chains?language=en&status=PAUSED&limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fakeRuntime.listAdminChains).toHaveBeenCalledWith({ language: "en", status: "PAUSED" });
    expect(body.chains[0]).not.toHaveProperty("sessionHash");
    expect(body.chains[0]).toMatchObject({ public_code: "ABC1234567", language: "en", current_hop: 4 });
  });

  it("передаёт фильтр состояния жалоб и не раскрывает служебные поля сообщения", async () => {
    fakeRuntime.listAdminReports.mockReturnValueOnce([report("one", "HIDDEN")]);

    const response = await reportsGet(request("http://localhost/api/v1/admin/reports?status=HIDDEN&limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fakeRuntime.listAdminReports).toHaveBeenCalledWith("HIDDEN");
    expect(body.reports[0]).toMatchObject({ id: "one", status: "HIDDEN", resolved_at: baseTime.toISOString() });
    expect(body.reports[0].message).not.toHaveProperty("sessionHash");
    expect(body.reports[0]).not.toHaveProperty("reporterHash");
  });

  it("переходит на вторую страницу по подписанному курсору", async () => {
    const rows = [theme("one"), theme("two"), theme("three")];
    fakeRuntime.listAdminThemes.mockReturnValue(rows);

    const first = await themesGet(request("http://localhost/api/v1/admin/themes?limit=1"));
    const firstBody = await first.json() as { next_cursor: string };
    const second = await themesGet(request(`http://localhost/api/v1/admin/themes?limit=1&cursor=${encodeURIComponent(firstBody.next_cursor)}`));
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody.themes[0].id).toBe("two");
    expect(secondBody.next_cursor).toEqual(expect.any(String));
  });

  it.each(["limit=0", "limit=51", "limit=-1", "limit=abc"])("отклоняет недопустимый лимит %s до обращения к данным", async (query) => {
    const response = await chainsGet(request(`http://localhost/api/v1/admin/chains?${query}`));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_FILTER");
    expect(fakeRuntime.listAdminChains).not.toHaveBeenCalled();
  });

  it("отклоняет повреждённый курсор до обращения к данным", async () => {
    const response = await reportsGet(request("http://localhost/api/v1/admin/reports?cursor=damaged"));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("CURSOR_INVALID");
    expect(fakeRuntime.listAdminReports).not.toHaveBeenCalled();
  });

  it("возвращает безопасный 503 при отсутствии административного метода", async () => {
    const original = fakeRuntime.listAdminThemes;
    fakeRuntime.listAdminThemes = undefined as unknown as typeof fakeRuntime.listAdminThemes;

    const response = await themesGet(request("http://localhost/api/v1/admin/themes"));
    const body = await response.json();

    fakeRuntime.listAdminThemes = original;
    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR", retry_after_seconds: 0 });
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
