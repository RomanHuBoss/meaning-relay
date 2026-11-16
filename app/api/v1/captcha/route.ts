// Этот обработчик выдаёт короткую локализованную проверку перед сохранением пользовательской трактовки.
import { NextRequest, NextResponse } from "next/server";
import { issueCaptcha } from "../../../../lib/http/captcha";
import { ensureSession, persistSession } from "../../../../lib/http/session";
import { requestErrorResponse } from "../../../../lib/http/errors";

export async function GET(request: NextRequest) {
  const claimId = request.nextUrl.searchParams.get("claim_id")?.trim() ?? "";
  if (!claimId || !/^[A-Za-z0-9_-]{8,128}$/u.test(claimId)) {
    return requestErrorResponse("INVALID_CAPTCHA_REQUEST", 422, "A claim id is required");
  }
  const session = ensureSession(request);
  if (session.isNew) {
    return requestErrorResponse("SESSION_REQUIRED", 401, "Session is required");
  }
  await persistSession(session.sid);
  const challenge = issueCaptcha(claimId, request.nextUrl.searchParams.get("locale"));
  const response = NextResponse.json({
    token: challenge.token,
    prompt: challenge.prompt,
    expires_at: challenge.expiresAt,
  }, { headers: { "Cache-Control": "no-store" } });
  return response;
}

