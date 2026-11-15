// Здесь собраны общие проверки закрытых административных маршрутов, подписи
// курсоров и единая форма ошибок, чтобы все операции имели одинаковую защиту.
import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, getAdminSession } from "./admin";
import { type InMemoryRelay, type AdminTheme, type AdminChainSummary, type AdminChainDetail, type AdminReport } from "../relay/in-memory";
import { relayRuntime } from "../relay/runtime";
import { RelayError } from "../../packages/shared/types/relay";
import { logSafeError } from "./safe-log";

const CURSOR_SECRET = process.env.SID_PEPPER ?? "development-only-sid-pepper";
const runtimeWithAdmin = relayRuntime as unknown as InMemoryRelay;

// Проверка администратора вынесена в общий помощник, чтобы каждый закрытый
// маршрут одинаково отвечал до обращения к данным и не раскрывал их гостю.
export async function requireAdminResponse(request: NextRequest): Promise<NextResponse | null> {
  const session = await getAdminSession(request);
  return session ? null : adminErrorResponse("ADMIN_REQUIRED", 401, "Admin authentication is required");
}

export function csrfErrorResponse(): NextResponse {
  return adminErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof RelayError) {
    // Состояния, которых нет, и конфликт перехода имеют разные HTTP-коды,
    // но наружу всегда передаётся единый безопасный формат ошибки.
    const status = error.code === "THEME_NOT_FOUND" || error.code === "CHAIN_NOT_FOUND" || error.code === "REPORT_NOT_FOUND"
      ? 404
      : error.code === "REPORT_ALREADY_RESOLVED" || error.code === "INVALID_STATE" || error.code === "THEME_NOT_ACTIVE" || error.code === "CHAIN_CAP_REACHED"
        ? 409
        : 400;
    return NextResponse.json({ error: { code: error.code, message: error.message, request_id: randomUUID(), retry_after_seconds: 0 } }, { status });
  }
  logSafeError("admin.route.failed", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error", request_id: randomUUID(), retry_after_seconds: 0 } }, { status: 500 });
}

export async function parseBody(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Ошибка разбора отделена от ошибки схемы: клиент получает точную причину
    // и может исправить JSON, не повторяя запрос вслепую.
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON", request_id: randomUUID(), retry_after_seconds: 0 } }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: { code: "INVALID_BODY", message: "Request body must be an object", request_id: randomUUID(), retry_after_seconds: 0 } }, { status: 422 });
  }
  return body as Record<string, unknown>;
}

export function invalidBody(message = "Request body has unknown or missing fields"): NextResponse {
  return NextResponse.json({ error: { code: "INVALID_BODY", message, request_id: randomUUID(), retry_after_seconds: 0 } }, { status: 422 });
}

export function encodeCursor(index: number): string {
  // Индекс списка не хранит внутренние идентификаторы. Подпись защищает его
  // от подмены между страницами и не позволяет клиенту перескочить произвольно.
  const payload = Buffer.from(JSON.stringify({ index }), "utf8").toString("base64url");
  const signature = createHmac("sha256", CURSOR_SECRET).update(payload, "utf8").digest("base64url");
  return payload + "." + signature;
}

export function decodeCursor(value: string | null): number | NextResponse {
  if (!value) return 0;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return invalidFilter("CURSOR_INVALID", "Cursor is invalid");
  const expected = createHmac("sha256", CURSOR_SECRET).update(payload, "utf8").digest("base64url");
  // Сначала проверяем подпись, и только потом декодируем JSON. Так повреждённое
  // значение не приводит к разбору данных, которым нельзя доверять.
  if (signature !== expected) return invalidFilter("CURSOR_INVALID", "Cursor is invalid");
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { index?: unknown };
    if (!Number.isInteger(parsed.index) || Number(parsed.index) < 0) return invalidFilter("CURSOR_INVALID", "Cursor is invalid");
    return Number(parsed.index);
  } catch {
    return invalidFilter("CURSOR_INVALID", "Cursor is invalid");
  }
}

export function invalidFilter(code: "INVALID_FILTER" | "CURSOR_INVALID", message: string): NextResponse {
  return NextResponse.json({ error: { code, message, request_id: randomUUID(), retry_after_seconds: 0 } }, { status: 400 });
}

export function parseLimit(value: string | null): number | NextResponse {
  if (value === null || value === "") return 20;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) return invalidFilter("INVALID_FILTER", "limit must be between 1 and 50");
  return parsed;
}

export function serializeTheme(theme: AdminTheme) {
  return { id: theme.id, slug: theme.slug, title_ru: theme.titleRu, title_en: theme.titleEn, seed_text_ru: theme.seedTextRu, seed_text_en: theme.seedTextEn, status: theme.status, created_at: theme.createdAt.toISOString(), updated_at: theme.updatedAt.toISOString() };
}

export function serializeChainSummary(chain: AdminChainSummary) {
  return { public_code: chain.publicCode, language: chain.language, theme_title: chain.themeTitle, current_hop: chain.currentHop, target_hops: chain.targetHops, status: chain.status, last_activity_at: chain.lastActivityAt.toISOString(), created_at: chain.createdAt.toISOString(), completed_at: chain.completedAt?.toISOString() ?? null };
}

export function serializeChainDetail(chain: AdminChainDetail) {
  return {
    chain: serializeChainSummary(chain),
    // Сериализатор намеренно перечисляет поля вручную: служебные хеши сессий,
    // адреса и прочие внутренние атрибуты не должны случайно попасть в ответ.
    seed: chain.seed,
    messages: chain.messages.map((message) => ({
      id: message.id,
      hop_index: message.hopIndex,
      text: message.text,
      moderation_status: message.moderationStatus,
      created_at: message.createdAt.toISOString(),
    })),
  };
}

export function serializeReport(report: AdminReport) {
  return {
    id: report.id,
    status: report.status,
    reason: report.reason,
    details: report.details,
    created_at: report.createdAt.toISOString(),
    resolved_at: report.resolvedAt?.toISOString() ?? null,
    message: {
      id: report.message.id,
      chain_public_code: report.message.chainPublicCode,
      hop_index: report.message.hopIndex,
      text: report.message.text,
      moderation_status: report.message.moderationStatus,
    },
    chain: { public_code: report.chain.publicCode, status: report.chain.status },
  };
}

export { runtimeWithAdmin };
