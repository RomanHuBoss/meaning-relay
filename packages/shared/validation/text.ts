// Здесь проверяется пользовательский текст до его записи, публикации или передачи следующему участнику.
import { createHash } from "node:crypto";
import {
  MAX_TEXT_CODE_POINTS,
  MAX_TEXT_WORDS,
  MIN_TEXT_CODE_POINTS,
} from "../constants";

export interface TextValidationSuccess {
  ok: true;
  normalized: string;
  codePointLength: number;
  wordCount: number;
  textHash: string;
}

export interface TextValidationFailure {
  ok: false;
  reason:
    | "TOO_SHORT"
    | "TOO_LONG"
    | "TOO_MANY_WORDS"
    | "NO_WORDS"
    | "CONTROL_CHARACTER"
    | "BACKSLASH"
    | "HTML"
    | "URL"
    | "EMAIL"
    | "PHONE"
    | "PAYMENT_CARD";
}

export type TextValidationResult = TextValidationSuccess | TextValidationFailure;

const WORD_RE = /[\p{L}\p{N}]+/gu;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function luhnValid(digits: string): boolean {
  // Проверка Луна отсекает номера карт без хранения исходной строки и её
  // передачи в журнал или в слой хранения сообщений.
  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

export function canonicalText(text: string): string {
  return text.normalize("NFC").trim();
}

export function textIdentity(text: string): string {
  return canonicalText(text)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function validateText(text: string): TextValidationResult {
  // Порядок проверок начинается с длины и опасных символов, затем выявляет
  // контактные данные и только после этого считает слова и хеш.
  const normalized = canonicalText(text);
  const codePointLength = Array.from(normalized).length;
  if (codePointLength < MIN_TEXT_CODE_POINTS) return { ok: false, reason: "TOO_SHORT" };
  if (codePointLength > MAX_TEXT_CODE_POINTS) return { ok: false, reason: "TOO_LONG" };
  if (/[\u0000-\u001F\u007F]/u.test(normalized)) return { ok: false, reason: "CONTROL_CHARACTER" };
  if (/\\/u.test(normalized)) return { ok: false, reason: "BACKSLASH" };
  if (/<[^>]*>/u.test(normalized)) return { ok: false, reason: "HTML" };
  if (/(?:https?:\/\/|www\.)\S+/iu.test(normalized)) return { ok: false, reason: "URL" };
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(normalized)) return { ok: false, reason: "EMAIL" };

  const phoneDigits = normalized.replace(/\D/gu, "");
  if (phoneDigits.length >= 7 && phoneDigits.length <= 15 && /(?:\+?\d[\d\s().-]{5,}\d)/u.test(normalized)) {
    return { ok: false, reason: "PHONE" };
  }

  const cardCandidates = normalized.match(/(?:\d[ -]?){13,19}/gu) ?? [];
  if (cardCandidates.some((candidate) => {
    const digits = candidate.replace(/\D/gu, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  })) {
    return { ok: false, reason: "PAYMENT_CARD" };
  }

  const wordCount = normalized.match(WORD_RE)?.length ?? 0;
  if (wordCount < 1) return { ok: false, reason: "NO_WORDS" };
  if (wordCount > MAX_TEXT_WORDS) return { ok: false, reason: "TOO_MANY_WORDS" };
  return { ok: true, normalized, codePointLength, wordCount, textHash: sha256(normalized) };
}

export function isDuplicateText(candidate: string, previous: string): boolean {
  return textIdentity(candidate) === textIdentity(previous);
}

export function sha256Text(text: string): string {
  return sha256(text);
}
