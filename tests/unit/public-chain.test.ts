// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { describe, expect, it } from "vitest";
import { publicMessageText } from "../../lib/http/public-chain";

describe("public chain moderation redaction", () => {
  it("uses the moderation placeholder only for hidden displayed text", () => {
    expect(publicMessageText({ text: "исходный текст", moderationStatus: "HIDDEN" })).toBe("[сообщение скрыто модератором]");
    expect(publicMessageText({ text: "исходный текст", moderationStatus: "ALLOWED" })).toBe("исходный текст");
  });
});
