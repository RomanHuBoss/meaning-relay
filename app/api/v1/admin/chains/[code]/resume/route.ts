// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { csrfMatches } from "../../../../../../../lib/http/session";
import { relayErrorResponse, storageUnavailableResponse } from "../../../../../../../lib/http/errors";
import { invalidBody, parseBody, requireAdminResponse, runtimeWithAdmin, csrfErrorResponse } from "../../../../../../../lib/http/admin-routes";

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const denied = await requireAdminResponse(request);
  if (denied) return denied;
  if (!csrfMatches(request)) return csrfErrorResponse();
  const body = await parseBody(request);
  if (body instanceof NextResponse || Object.keys(body).length > 0) return body instanceof NextResponse ? body : invalidBody("Body must be empty");
  if (typeof runtimeWithAdmin.resumeAdminChain !== "function") return storageUnavailableResponse();
  try { const chain = await Promise.resolve(runtimeWithAdmin.resumeAdminChain((await context.params).code)); return NextResponse.json({ chain: { public_code: chain.publicCode, status: chain.status } }); } catch (error) { return relayErrorResponse(error); }
}
