import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_TTL_DAYS } from "../../packages/shared/constants";
import { getPool } from "../db/pool";

export const SESSION_COOKIE = "sid";
export const CSRF_COOKIE = "csrf";
const SID_PEPPER = process.env.SID_PEPPER ?? "development-only-sid-pepper";

// HMAC нужен для значения, которое участвует в рабочих запросах, а отдельный
// хеш — для записи в базе. Ни одно из этих значений не раскрывает исходный SID.
export function sessionHashForSid(sid: string): string {
  return createHmac("sha256", SID_PEPPER).update(sid, "utf8").digest("hex");
}

export function sidHashForSid(sid: string): string {
  return createHash("sha256").update(sid + SID_PEPPER, "utf8").digest("hex");
}

export async function persistSession(sid: string): Promise<Date> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  if (process.env.DATABASE_URL) {
    // Повторное обращение к тому же SID продлевает срок сессии и не создаёт
    // вторую строку: это важно для безопасного повторного открытия страницы.
    await getPool().query(
      "INSERT INTO sessions (sid_hash, expires_at, last_seen_at) VALUES ($1, $2, now()) " +
      "ON CONFLICT (sid_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at, last_seen_at = now()",
      [sidHashForSid(sid), expiresAt],
    );
  }
  return expiresAt;
}

export function ensureSession(request: NextRequest): {
  sessionHash: string;
  sid: string;
  isNew: boolean;
} {
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  // Принимаем только URL-безопасный случайный идентификатор ограниченной длины;
  // произвольное значение cookie заменяется новым, а не используется повторно.
  const validExisting = Boolean(existing && /^[A-Za-z0-9_-]{32,128}$/u.test(existing));
  const sid = validExisting ? existing as string : randomBytes(32).toString("base64url");
  // Повреждённая cookie считается новой сессией: браузер должен получить
  // замену, иначе каждый следующий запрос снова будет приносить тот же мусор.
  return { sid, sessionHash: sessionHashForSid(sid), isNew: !validExisting };
}

export function attachSessionCookie(response: NextResponse, sid: string): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: sid,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
  });
}

export function csrfMatches(request: NextRequest): boolean {
  const cookie = request.cookies.get(CSRF_COOKIE)?.value;
  const header = request.headers.get("x-csrf-token");
  // Сначала сравниваем длину: timingSafeEqual требует буферы одинакового размера.
  // Само сравнение токенов затем выполняется за постоянное время.
  if (!cookie || !header || !/^[A-Za-z0-9_-]{32,128}$/u.test(cookie) || cookie.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(cookie, "utf8"), Buffer.from(header, "utf8"));
}

export function newCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function attachCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: CSRF_COOKIE,
    value: token,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });
}
