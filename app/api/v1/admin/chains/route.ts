// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { csrfMatches } from "../../../../../lib/http/session";
import { relayErrorResponse, storageUnavailableResponse } from "../../../../../lib/http/errors";
import { decodeCursor, encodeCursor, invalidBody, invalidFilter, parseBody, parseLimit, requireAdminResponse, runtimeWithAdmin, csrfErrorResponse } from "../../../../../lib/http/admin-routes";
import { serializeChainSummary } from "../../../../../lib/http/admin-routes";
import { SUPPORTED_LANGUAGES, type Language } from "../../../../../packages/shared/constants";

const languages = new Set<string>(SUPPORTED_LANGUAGES);
const statuses = new Set(["ACTIVE", "COMPLETED", "PAUSED", "ARCHIVED", "all"]);

export async function GET(request: NextRequest) {
  const denied = await requireAdminResponse(request);
  if (denied) return denied;
  const language = request.nextUrl.searchParams.get("language");
  const status = request.nextUrl.searchParams.get("status") ?? "all";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  if (language && !languages.has(language)) return invalidFilter("INVALID_FILTER", "language is invalid");
  if (!statuses.has(status)) return invalidFilter("INVALID_FILTER", "status is invalid");
  if (limit instanceof NextResponse) return limit;
  const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));
  if (cursor instanceof NextResponse) return cursor;
  if (typeof runtimeWithAdmin.listAdminChains !== "function") return storageUnavailableResponse();
  const chains = await Promise.resolve(runtimeWithAdmin.listAdminChains({ language: language as Language | undefined, status: status as "ACTIVE" | "COMPLETED" | "PAUSED" | "ARCHIVED" | "all" }));
  const page = chains.slice(cursor, cursor + limit);
  return NextResponse.json({ chains: page.map(serializeChainSummary), next_cursor: cursor + limit < chains.length ? encodeCursor(cursor + limit) : null });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminResponse(request);
  if (denied) return denied;
  if (!csrfMatches(request)) return csrfErrorResponse();
  const body = await parseBody(request);
  if (body instanceof NextResponse) return body;
  if (Object.keys(body).some((key) => !["theme_id", "language", "count"].includes(key)) || typeof body.theme_id !== "string" || typeof body.language !== "string" || !Number.isInteger(body.count) || Number(body.count) < 1 || Number(body.count) > 30 || !languages.has(body.language)) return invalidBody();
  if (typeof runtimeWithAdmin.createAdminChains !== "function") return storageUnavailableResponse();
  try {
    const chains = await Promise.resolve(runtimeWithAdmin.createAdminChains(body.theme_id as string, body.language as Language, Number(body.count)));
    return NextResponse.json({ created_count: chains.length, chains: chains.map(serializeChainSummary) }, { status: 201 });
  } catch (error) { return relayErrorResponse(error); }
}
