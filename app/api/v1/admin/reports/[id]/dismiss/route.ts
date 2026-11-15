// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { csrfMatches } from "../../../../../../../lib/http/session";
import { relayErrorResponse, storageUnavailableResponse } from "../../../../../../../lib/http/errors";
import { invalidBody, parseBody, requireAdminResponse, runtimeWithAdmin, csrfErrorResponse } from "../../../../../../../lib/http/admin-routes";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminResponse(request); if (denied) return denied;
  if (!csrfMatches(request)) return csrfErrorResponse();
  const body = await parseBody(request); if (body instanceof NextResponse) return body; if (Object.keys(body).length) return invalidBody("Body must be empty");
  if (typeof runtimeWithAdmin.dismissAdminReport !== "function") return storageUnavailableResponse();
  try { const report = await Promise.resolve(runtimeWithAdmin.dismissAdminReport((await context.params).id)); return NextResponse.json({ report: { id: report.id, status: report.status, resolved_at: report.resolvedAt?.toISOString() ?? null } }); } catch (error) { return relayErrorResponse(error); }
}
