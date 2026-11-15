// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { relayRuntime } from "../../../../../../lib/relay/runtime";
import { relayErrorResponse, requestErrorResponse } from "../../../../../../lib/http/errors";
import {
  attachSessionCookie,
  csrfMatches,
  ensureSession,
  persistSession,
} from "../../../../../../lib/http/session";
import { consumeRateLimit, rateLimitResponse } from "../../../../../../lib/http/rate-limit";

interface SubmitBody {
  claim_token?: unknown;
  idempotency_key?: unknown;
  text?: unknown;
  country_code?: unknown;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ claimId: string }> },
) {
  if (!csrfMatches(request)) {
    return requestErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
  }
  let body: SubmitBody;
  try {
    body = await request.json() as SubmitBody;
  } catch {
    return requestErrorResponse("INVALID_JSON", 400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return requestErrorResponse("INVALID_BODY", 422, "Request body must be an object");
  }
  const allowedKeys = ["claim_token", "idempotency_key", "text", "country_code"];
  if (Object.keys(body).some((key) => !allowedKeys.includes(key)) || !Object.prototype.hasOwnProperty.call(body, "country_code")) {
    return requestErrorResponse("INVALID_BODY", 422, "Request body has unknown or missing fields");
  }
  if (
    typeof body.claim_token !== "string" ||
    typeof body.idempotency_key !== "string" ||
    typeof body.text !== "string" ||
    (body.country_code !== undefined && body.country_code !== null && typeof body.country_code !== "string")
  ) {
    return requestErrorResponse("INVALID_BODY", 422, "claim_token, idempotency_key and text are required");
  }
  const { claimId } = await context.params;
  const session = ensureSession(request);
  try {
    await persistSession(session.sid);
    const rate = await consumeRateLimit("SUBMIT", session.sessionHash);
    if (!rate.allowed) {
      const response = rateLimitResponse(rate);
      if (session.isNew) attachSessionCookie(response, session.sid);
      return response;
    }
    const result = await relayRuntime.submit(
      claimId,
      session.sessionHash,
      body.claim_token,
      body.idempotency_key,
      body.text,
      body.country_code as string | null | undefined,
    );
    const response = NextResponse.json({
      replayed: result.replayed,
      message: {
        id: result.message.id,
        hop_index: result.message.hopIndex,
        text: result.message.text,
        word_count: result.message.wordCount,
        created_at: result.message.createdAt.toISOString(),
      },
      chain: {
        public_code: result.chain.publicCode,
        current_hop: result.chain.currentHop,
        target_hops: result.chain.targetHops,
        status: result.chain.status,
      },
    }, { status: result.replayed ? 200 : 201 });
    if (session.isNew) attachSessionCookie(response, session.sid);
    return response;
  } catch (error) {
    const response = relayErrorResponse(error);
    if (session.isNew) attachSessionCookie(response, session.sid);
    return response;
  }
}
