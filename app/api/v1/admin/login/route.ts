// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import {
  adminErrorResponse,
  adminKeyMatches,
  adminScopeHash,
  attachAdminCookie,
  createAdminSession,
} from "../../../../../lib/http/admin";
import { csrfMatches } from "../../../../../lib/http/session";
import { consumeRateLimit, rateLimitResponse } from "../../../../../lib/http/rate-limit";
import { logSafeError } from "../../../../../lib/http/safe-log";
import { requestErrorResponse } from "../../../../../lib/http/errors";

interface LoginBody {
  admin_key?: unknown;
}

export async function POST(request: NextRequest) {
  if (!csrfMatches(request)) {
    return adminErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
  }

  const rate = await consumeRateLimit("ADMIN_LOGIN", adminScopeHash(request));
  if (!rate.allowed) return rateLimitResponse(rate);

  let body: LoginBody;
  try {
    body = await request.json() as LoginBody;
  } catch {
    return adminErrorResponse("INVALID_JSON", 400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return adminErrorResponse("INVALID_BODY", 422, "Request body must be an object");
  }
  const unknownKey = Object.keys(body).find((key) => key !== "admin_key");
  if (unknownKey || typeof body.admin_key !== "string" || body.admin_key.length === 0) {
    return adminErrorResponse("INVALID_BODY", 422, "admin_key is required");
  }

  if (!adminKeyMatches(body.admin_key)) {
    return adminErrorResponse("ADMIN_INVALID_KEY", 401, "Admin key is invalid");
  }

  try {
    const session = await createAdminSession();
    const response = NextResponse.json({
      admin: { expires_at: session.expiresAt.toISOString() },
    }, { status: 200 });
    attachAdminCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    logSafeError("admin.login.failed", error);
    return requestErrorResponse("INTERNAL_ERROR", 500, "Internal server error");
  }
}

