// Этот модуль создаёт и проверяет административную сессию, не сохраняя ключ
// входа в браузере и не передавая его в клиентский код.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPool } from "../db/pool";
import { tokenHash } from "../crypto/token";

export const ADMIN_COOKIE = "admin_sid";
export const ADMIN_SESSION_TTL_HOURS = 8;
export const ADMIN_SESSION_TTL_SECONDS = ADMIN_SESSION_TTL_HOURS * 60 * 60;

interface MemoryAdminSession {
  expiresAt: number;
  revokedAt: number | null;
}

declare global {
  var meaningRelayAdminSessions: Map<string, MemoryAdminSession> | undefined;
}

const memoryAdminSessions = globalThis.meaningRelayAdminSessions ??
  (globalThis.meaningRelayAdminSessions = new Map<string, MemoryAdminSession>());

export interface AdminSession {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthenticatedAdminSession extends AdminSession {
  id?: string;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/** Сравнивает введённый ключ без досрочного выхода из сравнения строк. */
export function adminKeyMatches(value: string): boolean {
  const configured = process.env.ADMIN_KEY;
  if (!configured || typeof value !== "string") return false;
  return constantTimeEqual(value, configured);
}

function validAdminToken(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{32,128}$/u.test(value));
}

export async function createAdminSession(): Promise<AdminSession> {
  const token = randomBytes(32).toString("base64url");
  const hashed = tokenHash(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);

  if (process.env.DATABASE_URL) {
    await getPool().query(
      "INSERT INTO admin_sessions (token_hash, expires_at) VALUES ($1, $2)",
      [hashed, expiresAt],
    );
  } else {
    memoryAdminSessions.set(hashed, { expiresAt: expiresAt.getTime(), revokedAt: null });
  }

  return { token, tokenHash: hashed, expiresAt };
}

export async function getAdminSession(request: NextRequest): Promise<AuthenticatedAdminSession | null> {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!validAdminToken(token)) return null;
  const hashed = tokenHash(token);
  const now = new Date();

  if (process.env.DATABASE_URL) {
    const result = await getPool().query(
      "SELECT id, expires_at FROM admin_sessions " +
      "WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2 LIMIT 1",
      [hashed, now],
    );
    if (!result.rowCount) return null;
    const row = result.rows[0] as { id: string; expires_at: Date | string };
    return {
      id: String(row.id),
      token,
      tokenHash: hashed,
      expiresAt: new Date(row.expires_at),
    };
  }

  const session = memoryAdminSessions.get(hashed);
  if (!session || session.revokedAt !== null || session.expiresAt <= now.getTime()) {
    if (session && session.expiresAt <= now.getTime()) memoryAdminSessions.delete(hashed);
    return null;
  }
  return { token, tokenHash: hashed, expiresAt: new Date(session.expiresAt) };
}

/** Закрытые маршруты могут использовать любое имя; оба помощника возвращают null для отсутствующей или просроченной cookie. */
export const requireAdmin = getAdminSession;
export const requireAdminSession = getAdminSession;

export async function revokeAdminSession(token: string | undefined): Promise<void> {
  if (!validAdminToken(token)) return;
  const hashed = tokenHash(token);
  if (process.env.DATABASE_URL) {
    await getPool().query(
      "UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
      [hashed],
    );
    return;
  }
  const session = memoryAdminSessions.get(hashed);
  if (session) session.revokedAt = Date.now();
}

export function attachAdminCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

export function adminScopeHash(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(address, "utf8").digest("hex");
}

export function adminErrorResponse(
  code: "ADMIN_REQUIRED" | "ADMIN_INVALID_KEY" | "INVALID_BODY" | "INVALID_JSON" | "CSRF_INVALID",
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

