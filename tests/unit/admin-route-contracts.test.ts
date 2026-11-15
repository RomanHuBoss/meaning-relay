// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({
  listAdminThemes: vi.fn(),
  listAdminChains: vi.fn(),
  listAdminReports: vi.fn(),
  dismissAdminReport: vi.fn(),
  hideAdminReportMessage: vi.fn(),
  archiveAdminReportChain: vi.fn(),
  updateAdminTheme: vi.fn(),
  createAdminChains: vi.fn(),
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
import { POST as dismissPost } from "../../app/api/v1/admin/reports/[id]/dismiss/route";
import { POST as hidePost } from "../../app/api/v1/admin/reports/[id]/hide-message/route";
import { POST as archivePost } from "../../app/api/v1/admin/reports/[id]/archive-chain/route";
import { PATCH as themePatch } from "../../app/api/v1/admin/themes/[id]/route";

const csrf = "c".repeat(43);
const adminToken = "a".repeat(43);
const baseTime = new Date("2026-01-01T00:00:00.000Z");

function request(
  url: string,
  method: string = "GET",
  body?: string,
  options: { admin?: boolean; csrfHeader?: string; csrfCookie?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  const cookies: string[] = [];
  if (options.admin !== false) cookies.push(`admin_sid=${adminToken}`);
  cookies.push(`csrf=${options.csrfCookie ?? csrf}`);
  headers.set("cookie", cookies.join("; "));
  if (method !== "GET") headers.set("x-csrf-token", options.csrfHeader ?? csrf);
  return new NextRequest(url, { method, headers, body });
}

function theme(id: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED" = "ACTIVE") {
  return {
    id,
    slug: `theme-${id}`,
    titleRu: "Тема",
    titleEn: "Theme",
    seedTextRu: "Достаточно длинный seed-текст для темы.",
    seedTextEn: "A sufficiently long seed text for the theme.",
    status,
    createdAt: baseTime,
    updatedAt: baseTime,
  };
}

function chain(code: string) {
  return {
    publicCode: code,
    language: "ru" as const,
    themeTitle: "Тема",
    currentHop: 0,
    targetHops: 12,
    status: "ACTIVE" as const,
    lastActivityAt: baseTime,
    createdAt: baseTime,
    completedAt: null,
  };
}

describe("admin HTTP contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin.getAdminSession.mockResolvedValue({
      token: adminToken,
      tokenHash: "h".repeat(64),
      expiresAt: new Date(baseTime.getTime() + 8 * 60 * 60 * 1000),
    });
  });

  it("rejects an ordinary session before reaching admin runtime", async () => {
    fakeAdmin.getAdminSession.mockResolvedValueOnce(null);
    const response = await chainsGet(request("http://localhost/api/v1/admin/chains", "GET", undefined, { admin: false }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("ADMIN_REQUIRED");
    expect(fakeRuntime.listAdminChains).not.toHaveBeenCalled();
  });

  it("validates read-only filters, limits, and opaque cursors", async () => {
    fakeRuntime.listAdminThemes.mockReturnValueOnce([theme("one"), theme("two")]);
    const themes = await themesGet(request("http://localhost/api/v1/admin/themes?status=ACTIVE&limit=1"));
    expect(themes.status).toBe(200);
    const themeBody = await themes.json();
    expect(themeBody.themes).toHaveLength(1);
    expect(themeBody.next_cursor).toEqual(expect.any(String));
    expect(fakeRuntime.listAdminThemes).toHaveBeenCalledWith("ACTIVE");

    const invalidCursor = await themesGet(request("http://localhost/api/v1/admin/themes?cursor=bad"));
    expect(invalidCursor.status).toBe(400);
    expect((await invalidCursor.json()).error.code).toBe("CURSOR_INVALID");

    const invalidStatus = await reportsGet(request("http://localhost/api/v1/admin/reports?status=UNKNOWN"));
    expect(invalidStatus.status).toBe(400);
    expect((await invalidStatus.json()).error.code).toBe("INVALID_FILTER");

    const invalidLimit = await chainsGet(request("http://localhost/api/v1/admin/chains?limit=0"));
    expect(invalidLimit.status).toBe(400);
    expect((await invalidLimit.json()).error.code).toBe("INVALID_FILTER");

    const invalidLanguage = await chainsGet(request("http://localhost/api/v1/admin/chains?language=de"));
    expect(invalidLanguage.status).toBe(400);
    expect((await invalidLanguage.json()).error.code).toBe("INVALID_FILTER");
  });

  it("requires CSRF and an empty body for report mutations", async () => {
    const missingCsrf = await dismissPost(
      request("http://localhost/api/v1/admin/reports/report-1/dismiss", "POST", "{}", { csrfHeader: "wrong" }),
      { params: Promise.resolve({ id: "report-1" }) },
    );
    expect(missingCsrf.status).toBe(403);
    expect((await missingCsrf.json()).error.code).toBe("CSRF_INVALID");

    const unknownBody = await dismissPost(
      request("http://localhost/api/v1/admin/reports/report-1/dismiss", "POST", JSON.stringify({ extra: true })),
      { params: Promise.resolve({ id: "report-1" }) },
    );
    expect(unknownBody.status).toBe(422);
    expect((await unknownBody.json()).error.code).toBe("INVALID_BODY");
    expect(fakeRuntime.dismissAdminReport).not.toHaveBeenCalled();
  });

  it("serializes resolved_at for dismiss, hide, and archive mutations", async () => {
    const resolvedAt = new Date("2026-01-01T01:02:03.000Z");
    fakeRuntime.dismissAdminReport.mockResolvedValueOnce({ id: "report-1", status: "DISMISSED", resolvedAt });
    fakeRuntime.hideAdminReportMessage.mockResolvedValueOnce({
      report: { id: "report-2", status: "HIDDEN", resolvedAt },
      message: { id: "message-2", moderationStatus: "HIDDEN" },
    });
    fakeRuntime.archiveAdminReportChain.mockResolvedValueOnce({
      report: { id: "report-3", status: "CHAIN_ARCHIVED", resolvedAt },
      chain: { publicCode: "ABC1234567", status: "ARCHIVED" },
    });

    const dismissed = await dismissPost(
      request("http://localhost/api/v1/admin/reports/report-1/dismiss", "POST", "{}"),
      { params: Promise.resolve({ id: "report-1" }) },
    );
    expect(dismissed.status).toBe(200);
    expect((await dismissed.json()).report).toMatchObject({ id: "report-1", status: "DISMISSED", resolved_at: resolvedAt.toISOString() });

    const hidden = await hidePost(
      request("http://localhost/api/v1/admin/reports/report-2/hide-message", "POST", "{}"),
      { params: Promise.resolve({ id: "report-2" }) },
    );
    expect(hidden.status).toBe(200);
    expect((await hidden.json()).report).toMatchObject({ id: "report-2", status: "HIDDEN", resolved_at: resolvedAt.toISOString() });

    const archived = await archivePost(
      request("http://localhost/api/v1/admin/reports/report-3/archive-chain", "POST", "{}"),
      { params: Promise.resolve({ id: "report-3" }) },
    );
    expect(archived.status).toBe(200);
    expect((await archived.json()).report).toMatchObject({ id: "report-3", status: "CHAIN_ARCHIVED", resolved_at: resolvedAt.toISOString() });
  });

  it("maps repeated report mutation to a conflict without leaking storage details", async () => {
    fakeRuntime.dismissAdminReport.mockRejectedValueOnce(new RelayError("REPORT_ALREADY_RESOLVED"));
    const response = await dismissPost(
      request("http://localhost/api/v1/admin/reports/report-1/dismiss", "POST", "{}"),
      { params: Promise.resolve({ id: "report-1" }) },
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("REPORT_ALREADY_RESOLVED");
    expect(body.error.message).toBe("REPORT_ALREADY_RESOLVED");
  });

  it("validates theme patch fields before calling storage", async () => {
    const malformed = await themePatch(
      request("http://localhost/api/v1/admin/themes/theme-1", "PATCH", JSON.stringify({ status: "INVALID" })),
      { params: Promise.resolve({ id: "theme-1" }) },
    );
    expect(malformed.status).toBe(422);
    expect((await malformed.json()).error.code).toBe("INVALID_BODY");
    expect(fakeRuntime.updateAdminTheme).not.toHaveBeenCalled();

    const unknown = await themePatch(
      request("http://localhost/api/v1/admin/themes/theme-1", "PATCH", JSON.stringify({ title_ru: "Обновлено", extra: true })),
      { params: Promise.resolve({ id: "theme-1" }) },
    );
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).error.code).toBe("INVALID_BODY");
  });

  it("maps a missing theme from a patch to a safe 404", async () => {
    fakeRuntime.updateAdminTheme.mockRejectedValueOnce(new RelayError("THEME_NOT_FOUND"));
    const response = await themePatch(
      request("http://localhost/api/v1/admin/themes/missing", "PATCH", JSON.stringify({ status: "ACTIVE" })),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("THEME_NOT_FOUND");
  });
});
