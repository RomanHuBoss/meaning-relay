// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeRuntime = vi.hoisted(() => ({
  getPublicState: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));

import { GET as publicChainGet } from "../../app/api/v1/chains/[publicCode]/route";
import { decryptToken, encryptToken } from "../../lib/crypto/token";

const root = process.cwd();

describe("local security and privacy contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializes user text as JSON data and redacts hidden messages", async () => {
    const untrustedSeed = "<script>alert(1)</script>";
    const untrustedMessage = "<img src=x onerror=alert(1)>";
    fakeRuntime.getPublicState.mockResolvedValueOnce({
      publicCode: "123456789A",
      language: "ru",
      status: "COMPLETED",
      currentHop: 12,
      targetHops: 12,
      themeTitle: "<b>Тема</b>",
      completedAt: new Date("2026-11-14T12:00:00.000Z"),
      seedText: untrustedSeed,
      messages: [
        { id: "message-1", hopIndex: 1, text: untrustedMessage, moderationStatus: "ALLOWED" },
        { id: "message-2", hopIndex: 2, text: "секрет", moderationStatus: "HIDDEN" },
      ],
    });

    const response = await publicChainGet(
      new Request("http://localhost/api/v1/chains/123456789A"),
      { params: Promise.resolve({ publicCode: "123456789A" }) },
    );

    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.seed.text).toBe(untrustedSeed);
    expect(body.messages[0].text).toBe(untrustedMessage);
    expect(body.messages[1].text).toBe("[сообщение скрыто модератором]");
  });

  it("keeps encrypted recovery tokens opaque and rejects malformed key/payload", () => {
    const previous = process.env.CLAIM_TOKEN_ENCRYPTION_KEY;
    process.env.CLAIM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    try {
      const token = "recovery-token-value";
      const encrypted = encryptToken(token);
      expect(encrypted).not.toContain(token);
      expect(encrypted.split(".")).toHaveLength(3);
      expect(decryptToken(encrypted)).toBe(token);
      expect(() => decryptToken("not-a-ciphertext")).toThrow("Invalid encrypted token payload");
    } finally {
      if (previous === undefined) delete process.env.CLAIM_TOKEN_ENCRYPTION_KEY;
      else process.env.CLAIM_TOKEN_ENCRYPTION_KEY = previous;
    }

    const invalidPrevious = process.env.CLAIM_TOKEN_ENCRYPTION_KEY;
    process.env.CLAIM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 7).toString("base64");
    try {
      expect(() => encryptToken("token")).toThrow("32 bytes");
    } finally {
      if (invalidPrevious === undefined) delete process.env.CLAIM_TOKEN_ENCRYPTION_KEY;
      else process.env.CLAIM_TOKEN_ENCRYPTION_KEY = invalidPrevious;
    }
  });

  it("keeps inactive claim ciphertext empty and expires recovery rows", () => {
    const migration = readFileSync(path.join(root, "migrations/001_initial.sql"), "utf8");
    const postgres = readFileSync(path.join(root, "lib/relay/postgres.ts"), "utf8");

    expect(migration).toMatch(/active_token_ciphertext text NULL/u);
    expect(migration).toMatch(/status <> 'ACTIVE' AND active_token_ciphertext IS NULL/u);
    expect(postgres).toMatch(/UPDATE claims SET status = 'SUBMITTED', active_token_ciphertext = NULL/u);
    expect(postgres).toMatch(/UPDATE claims SET status = 'CANCELLED', active_token_ciphertext = NULL/u);
    expect(postgres).toMatch(/DELETE FROM recoveries r USING claims c WHERE r\.claim_id = c\.id AND \(c\.status <> 'ACTIVE'/u);
  });
});
