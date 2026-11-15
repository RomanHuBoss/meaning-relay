// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { relayErrorResponse, storageUnavailableResponse } from "../../../../../../lib/http/errors";
import { requireAdminResponse, runtimeWithAdmin, serializeChainDetail } from "../../../../../../lib/http/admin-routes";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const denied = await requireAdminResponse(request);
  if (denied) return denied;
  if (typeof runtimeWithAdmin.getAdminChain !== "function") return storageUnavailableResponse();
  try {
    const chain = await Promise.resolve(runtimeWithAdmin.getAdminChain((await context.params).code));
    return NextResponse.json(serializeChainDetail(chain));
  } catch (error) { return relayErrorResponse(error); }
}
