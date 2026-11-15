// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import {
  CSRF_COOKIE,
  attachCsrfCookie,
  newCsrfToken,
} from "../../../../lib/http/session";

export function GET(request: NextRequest) {
  const existing = request.cookies.get(CSRF_COOKIE)?.value;
  const token = existing && /^[A-Za-z0-9_-]{32,128}$/u.test(existing)
    ? existing
    : newCsrfToken();
  const response = NextResponse.json({ csrf: token });
  if (!existing || !/^[A-Za-z0-9_-]{32,128}$/u.test(existing)) attachCsrfCookie(response, token);
  return response;
}
