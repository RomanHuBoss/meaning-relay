// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import {
  attachCsrfCookie,
  attachSessionCookie,
  CSRF_COOKIE,
  csrfMatches,
  ensureSession,
  newCsrfToken,
  persistSession,
} from "../../../../lib/http/session";
import { relayErrorResponse, requestErrorResponse } from "../../../../lib/http/errors";

export async function POST(request: NextRequest) {
  if (!csrfMatches(request)) {
    return requestErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
  }
  const session = ensureSession(request);
  try {
    const expiresAt = await persistSession(session.sid);
    const response = NextResponse.json({
      session: { expires_at: expiresAt.toISOString() },
    }, { status: 201 });
    if (session.isNew) attachSessionCookie(response, session.sid);
    attachCsrfCookie(response, request.cookies.get(CSRF_COOKIE)?.value ?? newCsrfToken());
    return response;
  } catch (error) {
    return relayErrorResponse(error);
  }
}
