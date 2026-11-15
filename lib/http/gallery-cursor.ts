// Этот модуль выпускает подписанный курсор галереи и отклоняет подделанные,
// просроченные или содержащие неверный публичный код значения.
import { createHmac, timingSafeEqual } from "node:crypto";

const CURSOR_SECRET = process.env.SID_PEPPER ?? "development-only-sid-pepper";
const PUBLIC_CODE = /^[1-9A-HJ-NP-Za-km-z]{10}$/u;
/** Срок жизни нового курсора ограничивает повторное использование старой страницы. */
export const GALLERY_CURSOR_TTL_SECONDS = 15 * 60;

export interface GalleryCursor {
  completedAt: Date;
  publicCode: string;
  /** Необязательное поле оставлено для воспроизводимых проверок просрочки. */
  expiresAt?: Date;
}

function signature(payload: string): string {
  // Подпись связывает дату и публичный код, поэтому курсор нельзя перенести
  // на другую страницу или подменить без знания серверного секрета.
  return createHmac("sha256", CURSOR_SECRET).update(payload, "utf8").digest("base64url");
}

export function encodeGalleryCursor(value: GalleryCursor): string {
  const expiresAt = value.expiresAt ?? new Date(Date.now() + GALLERY_CURSOR_TTL_SECONDS * 1000);
  const payload = Buffer.from(JSON.stringify({
    completed_at: value.completedAt.toISOString(),
    public_code: value.publicCode,
    expires_at: expiresAt.toISOString(),
  }), "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function decodeGalleryCursor(value: string | null): GalleryCursor | null {
  if (!value) return null;
  const [payload, provided] = value.split(".");
  if (!payload || !provided) return null;
  const expected = signature(payload);
  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      completed_at?: unknown;
      public_code?: unknown;
      expires_at?: unknown;
    };
    if (typeof parsed.completed_at !== "string" || typeof parsed.public_code !== "string" || !PUBLIC_CODE.test(parsed.public_code)) return null;
    const completedAt = new Date(parsed.completed_at);
    if (!Number.isFinite(completedAt.getTime()) || completedAt.toISOString() !== parsed.completed_at) return null;
    if (parsed.expires_at !== undefined) {
      if (typeof parsed.expires_at !== "string") return null;
      const expiresAt = new Date(parsed.expires_at);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.toISOString() !== parsed.expires_at || expiresAt.getTime() <= Date.now()) return null;
    }
    return { completedAt, publicCode: parsed.public_code };
  } catch {
    return null;
  }
}
