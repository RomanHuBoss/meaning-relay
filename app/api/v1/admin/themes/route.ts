// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { csrfMatches } from "../../../../../lib/http/session";
import { relayErrorResponse, storageUnavailableResponse } from "../../../../../lib/http/errors";
import {
  decodeCursor, encodeCursor, invalidBody, invalidFilter, parseBody, parseLimit,
  requireAdminResponse, runtimeWithAdmin, serializeTheme, csrfErrorResponse,
} from "../../../../../lib/http/admin-routes";

const statuses = new Set(["DRAFT", "ACTIVE", "ARCHIVED", "all"]);

export async function GET(request: NextRequest) {
  const denied = await requireAdminResponse(request);
  if (denied) return denied;
  const status = request.nextUrl.searchParams.get("status") ?? "all";
  if (!statuses.has(status)) return invalidFilter("INVALID_FILTER", "status is invalid");
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  if (limit instanceof NextResponse) return limit;
  const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));
  if (cursor instanceof NextResponse) return cursor;
  if (typeof runtimeWithAdmin.listAdminThemes !== "function") return storageUnavailableResponse();
  const themes = await Promise.resolve(runtimeWithAdmin.listAdminThemes(status as "DRAFT" | "ACTIVE" | "ARCHIVED" | "all"));
  const page = themes.slice(cursor, cursor + limit);
  return NextResponse.json({ themes: page.map(serializeTheme), next_cursor: cursor + limit < themes.length ? encodeCursor(cursor + limit) : null });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminResponse(request);
  if (denied) return denied;
  if (!csrfMatches(request)) return csrfErrorResponse();
  const body = await parseBody(request);
  if (body instanceof NextResponse) return body;
  const allowed = ["slug", "title_ru", "title_en", "seed_text_ru", "seed_text_en", "status"];
  if (Object.keys(body).some((key) => !allowed.includes(key)) || allowed.some((key) => typeof body[key] !== "string")) return invalidBody();
  if (!statuses.has(String(body.status)) || body.status === "all") return invalidBody("status must be DRAFT, ACTIVE or ARCHIVED");
  if (typeof runtimeWithAdmin.createAdminTheme !== "function") return storageUnavailableResponse();
  try {
    const theme = await Promise.resolve(runtimeWithAdmin.createAdminTheme({ slug: body.slug as string, titleRu: body.title_ru as string, titleEn: body.title_en as string, seedTextRu: body.seed_text_ru as string, seedTextEn: body.seed_text_en as string, status: body.status as "DRAFT" | "ACTIVE" | "ARCHIVED" }));
    return NextResponse.json({ theme: serializeTheme(theme) }, { status: 201 });
  } catch (error) { return relayErrorResponse(error); }
}
