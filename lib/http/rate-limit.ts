import { withTransaction } from "../db/pool";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export type RateLimitKind = "START" | "SUBMIT" | "RECOVER" | "REPORT" | "ADMIN_LOGIN";

// Лимиты описаны рядом с их ключами, чтобы изменение числа запросов не могло
// случайно оставить без соответствующего окна времени один из маршрутов.
const LIMITS: Record<RateLimitKind, number> = {
  START: 20,
  SUBMIT: 10,
  RECOVER: 5,
  REPORT: 5,
  ADMIN_LOGIN: 5,
};

const WINDOW_MS: Record<RateLimitKind, number> = {
  START: 10 * 60 * 1000,
  SUBMIT: 10 * 60 * 1000,
  RECOVER: 10 * 60 * 1000,
  REPORT: 60 * 60 * 1000,
  ADMIN_LOGIN: 15 * 60 * 1000,
};

interface MemoryBucket {
  bucketStart: number;
  count: number;
}

// Карта используется только при локальном запуске без базы данных. В рабочем
// окружении те же счётчики хранятся в PostgreSQL и видны всем экземплярам.
const memoryBuckets = new Map<string, MemoryBucket>();

function bucketStart(now: Date, kind: RateLimitKind): Date {
  const windowMs = WINDOW_MS[kind];
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
}

/** Формирует единый ответ 429, включая время, после которого можно повторить запрос. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json({
    error: {
      code: "RATE_LIMITED",
      message: "Rate limit exceeded",
      request_id: randomUUID(),
      retry_after_seconds: result.retryAfterSeconds,
    },
  }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } });
}

export async function consumeRateLimit(kind: RateLimitKind, scopeHash: string): Promise<RateLimitResult> {
  const limit = LIMITS[kind];
  const now = new Date();
  const start = bucketStart(now, kind);
  const end = new Date(start.getTime() + WINDOW_MS[kind]);
  const retryAfterSeconds = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 1000));

  if (!process.env.DATABASE_URL) {
    // В локальном режиме ключ включает начало окна: старый счётчик не должен
    // переноситься в новый период после истечения текущего ограничения.
    const key = kind + ":" + scopeHash + ":" + start.toISOString();
    const previous = memoryBuckets.get(key) ?? { bucketStart: start.getTime(), count: 0 };
    previous.count += 1;
    memoryBuckets.set(key, previous);
    const allowed = previous.count <= limit;
    return { allowed, retryAfterSeconds: allowed ? 0 : retryAfterSeconds, limit, remaining: Math.max(0, limit - previous.count) };
  }

  // Увеличение счётчика выполняется одной операцией UPSERT внутри транзакции.
  // Это исключает потерю обновления, когда два запроса приходят одновременно.
  return withTransaction(async (client) => {
    const result = await client.query(
      "INSERT INTO rate_limit_buckets (scope_hash, limit_kind, bucket_start, count, expires_at) " +
      "VALUES ($1, $2, $3, 1, $4) " +
      "ON CONFLICT (scope_hash, limit_kind, bucket_start) DO UPDATE SET count = rate_limit_buckets.count + 1 " +
      "RETURNING count",
      [scopeHash, kind, start, new Date(end.getTime() + 24 * 60 * 60 * 1000)],
    );
    const count = Number(result.rows[0].count);
    const allowed = count <= limit;
    return { allowed, retryAfterSeconds: allowed ? 0 : retryAfterSeconds, limit, remaining: Math.max(0, limit - count) };
  });
}
