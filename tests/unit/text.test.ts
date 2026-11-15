// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { describe, expect, it } from "vitest";
import { MAX_TEXT_CODE_POINTS, MAX_TEXT_WORDS, MIN_TEXT_CODE_POINTS } from "../../packages/shared/constants";
import { isDuplicateText, validateText } from "../../packages/shared/validation/text";

describe("text validation", () => {
  it("normalizes NFC and counts Unicode code points", () => {
    const result = validateText("  Это длинная фраза для проверки смыслового телефона.  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe("Это длинная фраза для проверки смыслового телефона.");
      expect(result.codePointLength).toBeGreaterThanOrEqual(20);
    }
  });

  it.each([
    [MIN_TEXT_CODE_POINTS - 1, "TOO_SHORT"],
    [MAX_TEXT_CODE_POINTS + 1, "TOO_LONG"],
  ] as const)("enforces the %i Unicode code point boundary", (length, reason) => {
    const result = validateText("я".repeat(length));
    expect(result).toEqual({ ok: false, reason });
  });

  it("accepts exactly 20 and 500 Unicode code points, including astral symbols", () => {
    const atMinimum = validateText("🙂".repeat(MIN_TEXT_CODE_POINTS));
    expect(atMinimum).toMatchObject({ ok: false, reason: "NO_WORDS" });

    const twentyLetters = validateText("а".repeat(MIN_TEXT_CODE_POINTS));
    expect(twentyLetters).toMatchObject({ ok: true, codePointLength: MIN_TEXT_CODE_POINTS });

    const fiveHundredLetters = validateText("а".repeat(MAX_TEXT_CODE_POINTS));
    expect(fiveHundredLetters).toMatchObject({ ok: true, codePointLength: MAX_TEXT_CODE_POINTS });
  });

  it.each([
    ["коротко", "TOO_SHORT"],
    ["а".repeat(MAX_TEXT_CODE_POINTS + 1), "TOO_LONG"],
    [Array.from({ length: MAX_TEXT_WORDS + 1 }, (_, index) => `слово${index}`).join(" "), "TOO_MANY_WORDS"],
    ["текст с https://example.com внутри для проверки", "URL"],
    ["текст с test@example.com внутри для проверки", "EMAIL"],
    ["текст с\\ обратным слешем и достаточной длиной", "BACKSLASH"],
    ["текст с\u0007 управляющим символом внутри проверки", "CONTROL_CHARACTER"],
    ["текст с <b>HTML</b> внутри для проверки", "HTML"],
    ["текст с телефоном +372 5555 1234 для проверки", "PHONE"],
    ["текст с картой 4111 1111 1111 1111 для проверки", "PAYMENT_CARD"],
    [".........................", "NO_WORDS"],
  ] as const)("rejects %s", (text, reason) => {
    const result = validateText(text);
    expect(result).toEqual({ ok: false, reason });
  });

  it("detects exact normalized duplicate", () => {
    expect(isDuplicateText("  Смысл сохраняется! ", "СМЫСЛ сохраняется")).toBe(true);
  });
});
