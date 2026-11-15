// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { relayRuntime } from "../../../../../lib/relay/runtime";
import { relayErrorResponse, requestErrorResponse } from "../../../../../lib/http/errors";
import {
  csrfMatches,
  ensureSession,
  persistSession,
  SESSION_COOKIE,
} from "../../../../../lib/http/session";
import { consumeRateLimit, rateLimitResponse } from "../../../../../lib/http/rate-limit";

interface RecoverBody {
  public_code?: unknown;
  recover_idempotency_key?: unknown;
}

export async function POST(request: NextRequest) {
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    return requestErrorResponse("SESSION_REQUIRED", 401, "Session is required");
  }
  if (!csrfMatches(request)) {
    return requestErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
  }
  let body: RecoverBody;
  try {
    body = await request.json() as RecoverBody;
  } catch {
    return requestErrorResponse("INVALID_JSON", 400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return requestErrorResponse("INVALID_BODY", 422, "Request body must be an object");
  }
  const keys = Object.keys(body);
  if (keys.some((key) => !["public_code", "recover_idempotency_key"].includes(key)) || keys.length !== 2) {
    return requestErrorResponse("INVALID_BODY", 422, "Request body has unknown or missing fields");
  }
  if (typeof body.public_code !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{10}$/u.test(body.public_code)) {
    return requestErrorResponse("INVALID_PUBLIC_CODE", 400, "public_code has invalid format");
  }
  if (typeof body.recover_idempotency_key !== "string") {
    return requestErrorResponse("INVALID_BODY", 422, "recover_idempotency_key is required");
  }

  const session = ensureSession(request);
  try {
    await persistSession(session.sid);
    const rate = await consumeRateLimit("RECOVER", session.sessionHash);
    if (!rate.allowed) return rateLimitResponse(rate);
    const result = await relayRuntime.recover(body.public_code, session.sessionHash, body.recover_idempotency_key);
    return NextResponse.json({
      chain: {
        public_code: result.chain.publicCode,
        current_hop: result.chain.currentHop,
        target_hops: result.chain.targetHops,
        status: result.chain.status,
      },
      claim: {
        id: result.claim.id,
        hop_index: result.claim.hopIndex,
        status: result.claim.status,
        claim_token: result.claim.claimToken,
        expires_at: result.claim.expiresAt?.toISOString() ?? null,
        submitted_message_id: result.claim.submittedMessageId,
      },
      previous_message: {
        hop_index: result.claim.hopIndex - 1,
        text: result.previousText,
        is_seed: result.claim.hopIndex === 1,
      },
      recovered: result.recovered,
      replayed: result.replayed,
    }, { status: result.replayed ? 200 : 200 });
  } catch (error) {
    return relayErrorResponse(error);
  }
}
