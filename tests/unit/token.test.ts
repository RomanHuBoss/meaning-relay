// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, tokenHash } from "../../lib/crypto/token";

describe("claim token crypto", () => {
  it("round-trips opaque tokens with AES-256-GCM", () => {
    const previous = process.env.CLAIM_TOKEN_ENCRYPTION_KEY;
    process.env.CLAIM_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    try {
      const token = "opaque-token-for-a-claim";
      const encrypted = encryptToken(token);
      expect(encrypted).not.toContain(token);
      expect(decryptToken(encrypted)).toBe(token);
      expect(tokenHash(token)).toHaveLength(64);
    } finally {
      if (previous === undefined) delete process.env.CLAIM_TOKEN_ENCRYPTION_KEY;
      else process.env.CLAIM_TOKEN_ENCRYPTION_KEY = previous;
    }
  });
});
