// Здесь коды предметной области переводятся в безопасные HTTP-ответы без
// раскрытия внутренних исключений, запросов к базе и служебных деталей.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { RelayError, type RelayErrorCode } from "../../packages/shared/types/relay";
import { logSafeError } from "./safe-log";

// Все ошибки запроса проходят через один конверт: клиент получает код,
// безопасное сообщение, идентификатор обращения и понятное время повтора.
export function requestErrorResponse(
  code: string,
  status: number,
  message: string,
  retryAfterSeconds = 0,
): NextResponse {
  return NextResponse.json({
    error: {
      code,
      message,
      request_id: randomUUID(),
      retry_after_seconds: retryAfterSeconds,
    },
  }, {
    status,
    ...(retryAfterSeconds > 0 ? { headers: { "Retry-After": String(retryAfterSeconds) } } : {}),
  });
}

// Единый ответ временной недоступности хранилища не раскрывает, какой именно
// адаптер выбран, и сохраняет одинаковый формат для публичных и закрытых API.
export function storageUnavailableResponse(scope: "map" | "administrative" = "administrative"): NextResponse {
  return requestErrorResponse(
    "INTERNAL_ERROR",
    503,
    scope === "map" ? "Map storage is unavailable" : "Administrative storage is unavailable",
  );
}

const statusByCode: Partial<Record<RelayErrorCode, number>> = {
  INVALID_BODY: 422,
  INVALID_JSON: 400,
  INVALID_IDEMPOTENCY_KEY: 400,
  INVALID_COUNTRY_CODE: 400,
  INVALID_LANGUAGE: 400,
  INVALID_THEME: 400,
  INVALID_PERIOD: 400,
  CHAIN_NOT_FOUND: 404,
  CLAIM_NOT_FOUND: 404,
  CLAIM_OWNER_REQUIRED: 403,
  CHAIN_BUSY: 409,
  CHAIN_COMPLETED: 409,
  CHAIN_PAUSED: 409,
  LANGUAGE_MISMATCH: 409,
  SESSION_ALREADY_PARTICIPATED: 409,
  SESSION_HAS_ACTIVE_CLAIM: 409,
  START_IDEMPOTENCY_REUSED: 409,
  START_EXPIRED: 409,
  START_CANCELLED: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  CHAIN_ADVANCED: 409,
  TEXT_DUPLICATE: 422,
  TEXT_REJECTED: 422,
  CLAIM_EXPIRED: 410,
  CHAIN_ARCHIVED: 410,
  CLAIM_CANCELLED: 409,
  CLAIM_SUBMITTED: 409,
  CLAIM_TOKEN_INVALID: 403,
  INVALID_RECOVER_IDEMPOTENCY_KEY: 400,
  RECOVERY_IDEMPOTENCY_REUSED: 409,
  RECOVERY_STALE: 409,
  REPORT_NOT_ALLOWED: 409,
  REPORT_DUPLICATE: 409,
  MESSAGE_NOT_FOUND: 404,
  INVALID_REPORT_REASON: 422,
  NO_CHAIN_AVAILABLE: 409,
  NO_ACTIVE_SEED: 409,
  ADMIN_REQUIRED: 401,
  ADMIN_INVALID_KEY: 401,
  ADMIN_SESSION_EXPIRED: 401,
  REPORT_ALREADY_RESOLVED: 409,
  INVALID_STATE: 409,
  INVALID_FILTER: 400,
  CURSOR_INVALID: 400,
  THEME_NOT_FOUND: 404,
  THEME_NOT_ACTIVE: 409,
  CHAIN_CAP_REACHED: 409,
  REPORT_NOT_FOUND: 404,
};

// Неизвестные коды получают общий ответ 500: клиенту нельзя показывать детали
// внутреннего исключения, а оператору достаточно безопасного идентификатора.

export function relayErrorResponse(error: unknown): NextResponse {
  if (error instanceof RelayError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, request_id: randomUUID(), retry_after_seconds: 0 } },
      { status: statusByCode[error.code] ?? 400 },
    );
  }
  logSafeError("http.request.failed", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error", request_id: randomUUID(), retry_after_seconds: 0 } },
    { status: 500 },
  );
}
