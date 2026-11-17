// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { relayRuntime } from "../../../../../../lib/relay/runtime";
import { relayErrorResponse, requestErrorResponse } from "../../../../../../lib/http/errors";
import { csrfMatches, ensureSession, persistSession } from "../../../../../../lib/http/session";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ claimId: string }> },
) {
  if (!csrfMatches(request)) {
    return requestErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
  }
  const { claimId } = await context.params;
  const session = ensureSession(request);
  try {
    await persistSession(session.sid);
    await relayRuntime.cancel(claimId, session.sessionHash);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return relayErrorResponse(error);
  }
}
