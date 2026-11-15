// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { relayRuntime } from "../../../../../../lib/relay/runtime";
import { relayErrorResponse, requestErrorResponse } from "../../../../../../lib/http/errors";
import { consumeRateLimit, rateLimitResponse } from "../../../../../../lib/http/rate-limit";
import {
  attachSessionCookie,
  csrfMatches,
  ensureSession,
  persistSession,
} from "../../../../../../lib/http/session";
import type { ReportReason } from "../../../../../../packages/shared/types/relay";

interface ReportBody {
  reason?: unknown;
  details?: unknown;
}

const reasons: Record<string, ReportReason> = {
  spam: "SPAM",
  abuse: "ABUSE",
  personal_data: "PERSONAL_DATA",
  other: "OTHER",
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  if (!csrfMatches(request)) {
    return requestErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
  }
  let body: ReportBody;
  try {
    body = await request.json() as ReportBody;
  } catch {
    return requestErrorResponse("INVALID_JSON", 400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return requestErrorResponse("INVALID_BODY", 422, "Request body must be an object");
  }
  const keys = Object.keys(body);
  if (keys.some((key) => !["reason", "details"].includes(key)) || !Object.prototype.hasOwnProperty.call(body, "reason")) {
    return requestErrorResponse("INVALID_BODY", 422, "Request body has unknown or missing fields");
  }
  if (typeof body.reason !== "string") {
    return requestErrorResponse("INVALID_BODY", 422, "reason must be a string");
  }
  const reason = reasons[body.reason];
  if (!reason) {
    return requestErrorResponse("INVALID_REPORT_REASON", 422, "Unsupported report reason");
  }
  if (body.details !== undefined && (typeof body.details !== "string" || Array.from(body.details.trim()).length < 1 || Array.from(body.details.trim()).length > 300)) {
    return requestErrorResponse("INVALID_BODY", 422, "details must contain 1 to 300 Unicode code points");
  }

  const { messageId } = await context.params;
  const session = ensureSession(request);
  try {
    await persistSession(session.sid);
    const rate = await consumeRateLimit("REPORT", session.sessionHash);
    if (!rate.allowed) {
      const response = rateLimitResponse(rate);
      if (session.isNew) attachSessionCookie(response, session.sid);
      return response;
    }
    const result = await relayRuntime.report(messageId, session.sessionHash, reason, body.details as string | null | undefined);
    const response = NextResponse.json(result, { status: 201 });
    if (session.isNew) attachSessionCookie(response, session.sid);
    return response;
  } catch (error) {
    const response = relayErrorResponse(error);
    if (session.isNew) attachSessionCookie(response, session.sid);
    return response;
  }
}
