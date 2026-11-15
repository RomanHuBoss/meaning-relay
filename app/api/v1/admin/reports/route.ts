// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { storageUnavailableResponse } from "../../../../../lib/http/errors";
import { decodeCursor, encodeCursor, invalidFilter, parseLimit, requireAdminResponse, runtimeWithAdmin, serializeReport } from "../../../../../lib/http/admin-routes";

const statuses = new Set(["OPEN", "DISMISSED", "HIDDEN", "CHAIN_ARCHIVED", "all"]);

export async function GET(request: NextRequest) {
  const denied = await requireAdminResponse(request);
  if (denied) return denied;
  const status = request.nextUrl.searchParams.get("status") ?? "OPEN";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  if (!statuses.has(status)) return invalidFilter("INVALID_FILTER", "status is invalid");
  if (limit instanceof NextResponse) return limit;
  const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));
  if (cursor instanceof NextResponse) return cursor;
  if (typeof runtimeWithAdmin.listAdminReports !== "function") return storageUnavailableResponse();
  const reports = await Promise.resolve(runtimeWithAdmin.listAdminReports(status as "OPEN" | "DISMISSED" | "HIDDEN" | "CHAIN_ARCHIVED" | "all"));
  const page = reports.slice(cursor, cursor + limit);
  return NextResponse.json({ reports: page.map(serializeReport), next_cursor: cursor + limit < reports.length ? encodeCursor(cursor + limit) : null });
}
