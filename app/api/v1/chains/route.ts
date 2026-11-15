// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { relayRuntime } from "../../../../lib/relay/runtime";
import { relayErrorResponse } from "../../../../lib/http/errors";
import { decodeGalleryCursor, encodeGalleryCursor } from "../../../../lib/http/gallery-cursor";
import { SUPPORTED_LANGUAGES, type Language } from "../../../../packages/shared/constants";

const languages = new Set<string>([...SUPPORTED_LANGUAGES, "all"]);
const periods = new Set(["30d", "365d", "all"]);

function errorResponse(code: "INVALID_LANGUAGE" | "INVALID_THEME" | "INVALID_PERIOD" | "CURSOR_INVALID" | "INVALID_FILTER", status: number, message: string) {
  return NextResponse.json({ error: { code, message, request_id: randomUUID(), retry_after_seconds: 0 } }, { status });
}

export async function GET(request: NextRequest) {
  const language = request.nextUrl.searchParams.get("language") ?? "all";
  const theme = request.nextUrl.searchParams.get("theme") ?? "all";
  const period = request.nextUrl.searchParams.get("period") ?? "all";
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit === null || rawLimit === "" ? 12 : Number(rawLimit);
  if (!languages.has(language)) return errorResponse("INVALID_LANGUAGE", 400, "language must be one of ru, en, zh, fr, hi, es or all");
  if (!periods.has(period)) return errorResponse("INVALID_PERIOD", 400, "period must be 30d, 365d or all");
  if (!Number.isInteger(limit) || limit < 1) return errorResponse("INVALID_FILTER", 400, "limit must be a positive integer");
  const boundedLimit = Math.min(limit, 12);
  if (theme !== "all" && !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u.test(theme)) {
    return errorResponse("INVALID_THEME", 400, "theme must be a lower-case slug or all");
  }
  const rawCursor = request.nextUrl.searchParams.get("cursor");
  const cursor = decodeGalleryCursor(rawCursor);
  if (rawCursor && !cursor) return errorResponse("CURSOR_INVALID", 400, "cursor is invalid");
  try {
    const rows = await relayRuntime.listGallery({
      language: language === "all" ? undefined : language as Language,
      themeSlug: theme === "all" ? undefined : theme,
      period: period as "30d" | "365d" | "all",
      cursor,
      limit: boundedLimit + 1,
    });
    const hasMore = rows.length > boundedLimit;
    const page = hasMore ? rows.slice(0, boundedLimit) : rows;
    const nextCursor = hasMore && page.length > 0
      ? encodeGalleryCursor({ completedAt: page[page.length - 1].completedAt, publicCode: page[page.length - 1].publicCode })
      : null;
    return NextResponse.json({
      chains: page.map((chain) => ({
        public_code: chain.publicCode,
        language: chain.language,
        theme_title: chain.themeTitle,
        completed_at: chain.completedAt.toISOString(),
        target_hops: chain.targetHops,
      })),
      next_cursor: nextCursor,
    });
  } catch (error) {
    return relayErrorResponse(error);
  }
}
