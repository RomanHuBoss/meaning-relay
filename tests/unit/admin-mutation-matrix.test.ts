// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({
  createAdminTheme: vi.fn(),
  updateAdminTheme: vi.fn(),
  createAdminChains: vi.fn(),
  pauseAdminChain: vi.fn(),
  resumeAdminChain: vi.fn(),
  archiveAdminChain: vi.fn(),
  listAdminChains: vi.fn(),
  listAdminReports: vi.fn(),
  dismissAdminReport: vi.fn(),
  hideAdminReportMessage: vi.fn(),
  archiveAdminReportChain: vi.fn(),
}));

const fakeAdmin = vi.hoisted(() => ({ getAdminSession: vi.fn() }));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));
vi.mock("../../lib/http/admin", async () => {
  const actual = await vi.importActual<typeof import("../../lib/http/admin")>("../../lib/http/admin");
  return { ...actual, getAdminSession: fakeAdmin.getAdminSession };
});

import { POST as themeCreatePost } from "../../app/api/v1/admin/themes/route";
import { PATCH as themePatch } from "../../app/api/v1/admin/themes/[id]/route";
import { POST as chainsCreatePost, GET as chainsGet } from "../../app/api/v1/admin/chains/route";
import { POST as pausePost } from "../../app/api/v1/admin/chains/[code]/pause/route";
import { POST as resumePost } from "../../app/api/v1/admin/chains/[code]/resume/route";
import { POST as archivePost } from "../../app/api/v1/admin/chains/[code]/archive/route";
import { GET as reportsGet } from "../../app/api/v1/admin/reports/route";
import { POST as dismissPost } from "../../app/api/v1/admin/reports/[id]/dismiss/route";
import { POST as hidePost } from "../../app/api/v1/admin/reports/[id]/hide-message/route";
import { POST as archiveReportPost } from "../../app/api/v1/admin/reports/[id]/archive-chain/route";

const csrf = "c".repeat(43);
const adminToken = "a".repeat(43);
const baseTime = new Date("2026-01-01T00:00:00.000Z");

function request(url: string, method = "GET", body?: string, options: { csrfHeader?: string; csrfCookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  headers.set("cookie", `admin_sid=${adminToken}; csrf=${options.csrfCookie ?? csrf}`);
  if (method !== "GET") headers.set("x-csrf-token", options.csrfHeader ?? csrf);
  return new NextRequest(url, { method, headers, body });
}

function chain(publicCode = "ABC1234567", status: "ACTIVE" | "PAUSED" | "ARCHIVED" = "ACTIVE") {
  return {
    publicCode,
    language: "ru" as const,
    themeTitle: "Тема",
    currentHop: 0,
    targetHops: 12,
    status,
    lastActivityAt: baseTime,
    createdAt: baseTime,
    completedAt: null,
  };
}

function report(id: string, status: "OPEN" | "DISMISSED" | "HIDDEN" | "CHAIN_ARCHIVED" = "OPEN") {
  return {
    id,
    status,
    reason: "SPAM" as const,
    details: null,
    createdAt: baseTime,
    resolvedAt: status === "OPEN" ? null : baseTime,
    message: { id: `message-${id}`, chainPublicCode: "ABC1234567", hopIndex: 1, text: "Текст", moderationStatus: "ALLOWED" as const },
    chain: { publicCode: "ABC1234567", status: "COMPLETED" as const },
  };
}

describe("admin mutation and pagination matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin.getAdminSession.mockResolvedValue({ token: adminToken, tokenHash: "h".repeat(64), expiresAt: new Date(baseTime.getTime() + 28_800_000) });
  });

  it("validates theme creation body, CSRF, and serializes a created theme", async () => {
    const missingCsrf = await themeCreatePost(request("http://localhost/api/v1/admin/themes", "POST", JSON.stringify({}), { csrfHeader: "wrong" }));
    expect(missingCsrf.status).toBe(403);
    expect((await missingCsrf.json()).error.code).toBe("CSRF_INVALID");

    const malformed = await themeCreatePost(request("http://localhost/api/v1/admin/themes", "POST", "{"));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("INVALID_JSON");

    const nonObject = await themeCreatePost(request("http://localhost/api/v1/admin/themes", "POST", "[]"));
    expect(nonObject.status).toBe(422);
    expect((await nonObject.json()).error.code).toBe("INVALID_BODY");

    const invalid = await themeCreatePost(request("http://localhost/api/v1/admin/themes", "POST", JSON.stringify({
      slug: "theme", title_ru: "Тема", title_en: "Theme", seed_text_ru: "seed", seed_text_en: "seed", status: "all",
    })));
    expect(invalid.status).toBe(422);
    expect(fakeRuntime.createAdminTheme).not.toHaveBeenCalled();

    fakeRuntime.createAdminTheme.mockResolvedValueOnce({
      id: "theme-1", slug: "theme", titleRu: "Тема", titleEn: "Theme", seedTextRu: "seed", seedTextEn: "seed", status: "DRAFT", createdAt: baseTime, updatedAt: baseTime,
    });
    const created = await themeCreatePost(request("http://localhost/api/v1/admin/themes", "POST", JSON.stringify({
      slug: "theme", title_ru: "Тема", title_en: "Theme", seed_text_ru: "seed", seed_text_en: "seed", status: "DRAFT",
    })));
    expect(created.status).toBe(201);
    expect((await created.json()).theme).toMatchObject({ id: "theme-1", status: "DRAFT", created_at: baseTime.toISOString() });
  });

  it("validates chain creation count/language and serializes created chains", async () => {
    const badCsrf = await chainsCreatePost(request("http://localhost/api/v1/admin/chains", "POST", "{}", { csrfHeader: "wrong" }));
    expect(badCsrf.status).toBe(403);
    expect((await badCsrf.json()).error.code).toBe("CSRF_INVALID");

    const malformed = await chainsCreatePost(request("http://localhost/api/v1/admin/chains", "POST", "{"));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("INVALID_JSON");

    const invalidCount = await chainsCreatePost(request("http://localhost/api/v1/admin/chains", "POST", JSON.stringify({ theme_id: "theme", language: "ru", count: 31 })));
    expect(invalidCount.status).toBe(422);
    const invalidLanguage = await chainsCreatePost(request("http://localhost/api/v1/admin/chains", "POST", JSON.stringify({ theme_id: "theme", language: "de", count: 1 })));
    expect(invalidLanguage.status).toBe(422);

    fakeRuntime.createAdminChains.mockResolvedValueOnce([chain()]);
    const created = await chainsCreatePost(request("http://localhost/api/v1/admin/chains", "POST", JSON.stringify({ theme_id: "theme", language: "ru", count: 1 })));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ created_count: 1, chains: [{ public_code: "ABC1234567", status: "ACTIVE" }] });
  });

  it("requires CSRF for theme patch and serializes the updated theme", async () => {
    const badCsrf = await themePatch(
      request("http://localhost/api/v1/admin/themes/theme-1", "PATCH", JSON.stringify({ status: "ACTIVE" }), { csrfHeader: "wrong" }),
      { params: Promise.resolve({ id: "theme-1" }) },
    );
    expect(badCsrf.status).toBe(403);
    expect((await badCsrf.json()).error.code).toBe("CSRF_INVALID");

    fakeRuntime.updateAdminTheme.mockResolvedValueOnce({
      id: "theme-1", slug: "theme", titleRu: "Обновлённая тема", titleEn: "Updated theme", seedTextRu: "seed", seedTextEn: "seed", status: "ACTIVE", createdAt: baseTime, updatedAt: baseTime,
    });
    const updated = await themePatch(
      request("http://localhost/api/v1/admin/themes/theme-1", "PATCH", JSON.stringify({ title_ru: "Обновлённая тема", status: "ACTIVE" })),
      { params: Promise.resolve({ id: "theme-1" }) },
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).theme).toMatchObject({ id: "theme-1", title_ru: "Обновлённая тема", status: "ACTIVE", updated_at: baseTime.toISOString() });
  });

  it.each([
    ["pause", pausePost, "pauseAdminChain"],
    ["resume", resumePost, "resumeAdminChain"],
    ["archive", archivePost, "archiveAdminChain"],
  ] as const)("requires CSRF and empty body for chain %s", async (_name, route, runtimeName) => {
    const badCsrf = await route(request("http://localhost/api/v1/admin/chains/ABC1234567/action", "POST", "{}", { csrfHeader: "wrong" }), { params: Promise.resolve({ code: "ABC1234567" }) });
    expect(badCsrf.status).toBe(403);
    const unknown = await route(request("http://localhost/api/v1/admin/chains/ABC1234567/action", "POST", JSON.stringify({ extra: true })), { params: Promise.resolve({ code: "ABC1234567" }) });
    expect(unknown.status).toBe(422);
    expect(fakeRuntime[runtimeName]).not.toHaveBeenCalled();
  });

  it("serializes pause, resume, and archive chain transitions", async () => {
    fakeRuntime.pauseAdminChain.mockResolvedValueOnce(chain("ABC1234567", "PAUSED"));
    fakeRuntime.resumeAdminChain.mockResolvedValueOnce(chain());
    fakeRuntime.archiveAdminChain.mockResolvedValueOnce(chain("ABC1234567", "ARCHIVED"));
    const paused = await pausePost(request("http://localhost/api/v1/admin/chains/ABC1234567/pause", "POST", "{}"), { params: Promise.resolve({ code: "ABC1234567" }) });
    const resumed = await resumePost(request("http://localhost/api/v1/admin/chains/ABC1234567/resume", "POST", "{}"), { params: Promise.resolve({ code: "ABC1234567" }) });
    const archived = await archivePost(request("http://localhost/api/v1/admin/chains/ABC1234567/archive", "POST", "{}"), { params: Promise.resolve({ code: "ABC1234567" }) });
    expect((await paused.json()).chain.status).toBe("PAUSED");
    expect((await resumed.json()).chain.status).toBe("ACTIVE");
    expect((await archived.json()).chain.status).toBe("ARCHIVED");
  });

  it("paginates admin chains and reports with signed cursors", async () => {
    fakeRuntime.listAdminChains.mockResolvedValueOnce([chain("one"), chain("two")]);
    const chains = await chainsGet(request("http://localhost/api/v1/admin/chains?limit=1"));
    expect((await chains.json()).next_cursor).toEqual(expect.any(String));

    fakeRuntime.listAdminReports.mockResolvedValueOnce([report("one"), report("two")]);
    const reports = await reportsGet(request("http://localhost/api/v1/admin/reports?status=all&limit=1"));
    expect((await reports.json()).next_cursor).toEqual(expect.any(String));

    const invalidChainCursor = await chainsGet(request("http://localhost/api/v1/admin/chains?cursor=bad"));
    expect(invalidChainCursor.status).toBe(400);
    expect((await invalidChainCursor.json()).error.code).toBe("CURSOR_INVALID");
    const invalidReportCursor = await reportsGet(request("http://localhost/api/v1/admin/reports?cursor=bad"));
    expect(invalidReportCursor.status).toBe(400);
    expect((await invalidReportCursor.json()).error.code).toBe("CURSOR_INVALID");
  });

  it.each([
    [dismissPost, "dismissAdminReport"],
    [hidePost, "hideAdminReportMessage"],
    [archiveReportPost, "archiveAdminReportChain"],
  ] as const)("maps repeated report mutation to REPORT_ALREADY_RESOLVED", async (route, runtimeName) => {
    fakeRuntime[runtimeName].mockRejectedValueOnce(new RelayError("REPORT_ALREADY_RESOLVED"));
    const response = await route(request("http://localhost/api/v1/admin/reports/report-1/action", "POST", "{}"), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("REPORT_ALREADY_RESOLVED");
  });
});
