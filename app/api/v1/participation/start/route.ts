// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { relayRuntime } from "../../../../../lib/relay/runtime";
import { relayErrorResponse, requestErrorResponse } from "../../../../../lib/http/errors";
import {
  attachSessionCookie,
  csrfMatches,
  ensureSession,
  persistSession,
} from "../../../../../lib/http/session";
import { isSupportedLanguage, type Language } from "../../../../../packages/shared/constants";
import { consumeRateLimit, rateLimitResponse } from "../../../../../lib/http/rate-limit";

interface StartBody {
  language?: unknown;
  public_code?: unknown;
  exclude_public_code?: unknown;
  idempotency_key?: unknown;
}

function serialize(result: Awaited<ReturnType<typeof relayRuntime.start>>) {
  return {
    replayed: result.replayed,
    chain: {
      public_code: result.chain.publicCode,
      language: result.chain.language,
      current_hop: result.chain.currentHop,
      target_hops: result.chain.targetHops,
      status: result.chain.status,
    },
    claim: {
      id: result.claim.id,
      hop_index: result.claim.hopIndex,
      status: result.claim.status,
      expires_at: result.claim.expiresAt?.toISOString() ?? null,
      claim_token: result.claim.claimToken,
      submitted_message_id: result.claim.submittedMessageId,
    },
    previous_message: {
      hop_index: result.claim.hopIndex - 1,
      text: result.previousText,
      is_seed: result.claim.hopIndex === 1,
    },
  };
}

export async function POST(request: NextRequest) {
  if (!csrfMatches(request)) {
    return requestErrorResponse("CSRF_INVALID", 403, "CSRF token is invalid");
  }
  let body: StartBody;
  try {
    body = await request.json() as StartBody;
  } catch {
    return requestErrorResponse("INVALID_JSON", 400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return requestErrorResponse("INVALID_BODY", 422, "Request body must be an object");
  }
  const language = body.language;
  const idempotencyKey = body.idempotency_key;
  const publicCode = body.public_code;
  const excludedPublicCode = body.exclude_public_code;
  const allowedKeys = ["language", "public_code", "exclude_public_code", "idempotency_key"];
  const unknownKey = Object.keys(body).find((key) => !allowedKeys.includes(key));
  if (unknownKey || !Object.prototype.hasOwnProperty.call(body, "public_code")) {
    return requestErrorResponse("INVALID_BODY", 422, "Request body has unknown or missing fields");
  }
  if (!isSupportedLanguage(language)) {
    return requestErrorResponse("INVALID_LANGUAGE", 400, "language must be one of ru, en, zh, fr, hi or es");
  }
  if (typeof idempotencyKey !== "string") {
    return requestErrorResponse("INVALID_BODY", 422, "idempotency_key is required");
  }
  if (publicCode !== undefined && publicCode !== null && typeof publicCode !== "string") {
    return requestErrorResponse("INVALID_BODY", 422, "public_code must be a string or null");
  }
  if (typeof publicCode === "string" && !/^[1-9A-HJ-NP-Za-km-z]{10}$/u.test(publicCode)) {
    return requestErrorResponse("INVALID_PUBLIC_CODE", 400, "public_code has invalid format");
  }
  if (excludedPublicCode !== undefined && excludedPublicCode !== null && typeof excludedPublicCode !== "string") {
    return requestErrorResponse("INVALID_BODY", 422, "exclude_public_code must be a string or null");
  }
  if (typeof excludedPublicCode === "string" && !/^[1-9A-HJ-NP-Za-km-z]{10}$/u.test(excludedPublicCode)) {
    return requestErrorResponse("INVALID_PUBLIC_CODE", 400, "exclude_public_code has invalid format");
  }

  const session = ensureSession(request);
  try {
    await persistSession(session.sid);
    const rate = await consumeRateLimit("START", session.sessionHash);
    if (!rate.allowed) {
      const response = rateLimitResponse(rate);
      if (session.isNew) attachSessionCookie(response, session.sid);
      return response;
    }
    const startArguments = [
      language as Language,
      session.sessionHash,
      idempotencyKey,
      publicCode as string | null | undefined,
    ] as const;
    const result = typeof excludedPublicCode === "string"
      ? await relayRuntime.start(...startArguments, excludedPublicCode)
      : await relayRuntime.start(...startArguments);
    const response = NextResponse.json(serialize(result), { status: result.replayed ? 200 : 201 });
    if (session.isNew) attachSessionCookie(response, session.sid);
    return response;
  } catch (error) {
    const response = relayErrorResponse(error);
    if (session.isNew) attachSessionCookie(response, session.sid);
    return response;
  }
}
