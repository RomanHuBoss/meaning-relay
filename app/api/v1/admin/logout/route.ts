// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import {
  adminErrorResponse,
  clearAdminCookie,
  revokeAdminSession,
} from "../../../../../lib/http/admin";
import { csrfMatches } from "../../../../../lib/http/session";
import { logSafeError } from "../../../../../lib/http/safe-log";
import { requestErrorResponse } from "../../../../../lib/http/errors";

export async function POST(request: NextRequest) {
  if (!csrfMatches(request)) {
    return adminErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
  }

  try {
    await revokeAdminSession(request.cookies.get("admin_sid")?.value);
  } catch (error) {
    logSafeError("admin.logout.failed", error);
    // Выход намеренно идемпотентен. Даже если хранилище временно недоступно,
    // cookie браузера нужно очистить до сообщения об ошибке.
    const response = requestErrorResponse("INTERNAL_ERROR", 500, "Internal server error");
    clearAdminCookie(response);
    return response;
  }

  const response = new NextResponse(null, { status: 204 });
  clearAdminCookie(response);
  return response;
}

