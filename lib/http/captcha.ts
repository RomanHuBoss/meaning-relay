// Этот модуль выдаёт подписанную арифметическую проверку и проверяет ответ на сервере.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export type CaptchaLocale = "ru" | "en" | "es" | "zh" | "fr" | "hi";

const CAPTCHA_TTL_SECONDS = 10 * 60;
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET ?? process.env.SID_PEPPER ?? "development-only-captcha-secret";

const promptCopy: Record<CaptchaLocale, string> = {
  ru: "Проверка: сколько будет {a} + {b}?",
  en: "Check: what is {a} + {b}?",
  es: "Comprobación: ¿cuánto es {a} + {b}?",
  zh: "验证：{a} + {b} 等于多少？",
  fr: "Vérification : combien font {a} + {b} ?",
  hi: "जाँच: {a} + {b} कितना होगा?",
};

interface CaptchaPayload {
  claimId: string;
  a: number;
  b: number;
  expiresAt: number;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", CAPTCHA_SECRET).update(payload, "utf8").digest("base64url");
}

function normalizeLocale(locale: string | null | undefined): CaptchaLocale {
  return locale && locale in promptCopy ? locale as CaptchaLocale : "ru";
}

export function issueCaptcha(claimId: string, locale?: string | null): { token: string; prompt: string; expiresAt: string } {
  // Два небольших двузначных слагаемых остаются простыми для человека,
  // но расширяют пространство ответов для автоматического перебора.
  const a = randomInt(2, 20);
  const b = randomInt(2, 20);
  const expiresAt = Math.floor(Date.now() / 1000) + CAPTCHA_TTL_SECONDS;
  const payload = JSON.stringify({ claimId, a, b, expiresAt } satisfies CaptchaPayload);
  const encodedPayload = encode(payload);
  const token = `${encodedPayload}.${sign(encodedPayload)}`;
  const language = normalizeLocale(locale);
  return {
    token,
    prompt: promptCopy[language].replace("{a}", String(a)).replace("{b}", String(b)),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export function verifyCaptcha(token: unknown, answer: unknown, claimId: string): boolean {
  if (typeof token !== "string" || typeof answer !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/u.test(parts[0]) || !/^[A-Za-z0-9_-]+$/u.test(parts[1])) return false;
  const expectedSignature = sign(parts[0]);
  const providedSignature = Buffer.from(parts[1], "base64url");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "base64url");
  if (providedSignature.length !== expectedSignatureBuffer.length || !timingSafeEqual(providedSignature, expectedSignatureBuffer)) return false;
  let payload: CaptchaPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as CaptchaPayload;
  } catch {
    return false;
  }
  if (payload.claimId !== claimId || !Number.isInteger(payload.a) || !Number.isInteger(payload.b) || payload.expiresAt < Math.floor(Date.now() / 1000)) return false;
  return /^\d{1,3}$/u.test(answer.trim()) && Number(answer.trim()) === payload.a + payload.b;
}

