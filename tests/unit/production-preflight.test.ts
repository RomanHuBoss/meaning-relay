// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { describe, expect, it } from "vitest";
import { verifyPreflight } from "../../scripts/verify-production.mjs";

const cron = { crons: [{ path: "/api/v1/internal/maintenance", schedule: "* * * * *" }] };
const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://db.example/meaning_relay",
  DATABASE_SSL: "require",
  MAINTENANCE_TIMEOUT_MS: "15000",
  CLAIM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SID_PEPPER: "s".repeat(40),
  ADMIN_KEY: "a".repeat(40),
  CRON_SECRET: "c".repeat(40),
  PUBLIC_BASE_URL: "https://relay.example.com",
  PRIVACY_OPERATOR_NAME: "Meaning Relay",
  PRIVACY_CONTACT_EMAIL: "privacy@example.com",
  MODERATION_CONTACT_EMAIL: "moderation@example.com",
};

describe("production preflight", () => {
  it("accepts a complete production configuration and cron contract", () => {
    const result = verifyPreflight(production, cron);
    expect(result.mode).toBe("production");
    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("fails closed for missing secrets and insecure production URLs", () => {
    const result = verifyPreflight({ ...production, DATABASE_URL: "postgresql://postgres:password@localhost:5432/meaning_relay", DATABASE_SSL: "disable", CLAIM_TOKEN_ENCRYPTION_KEY: "bad", PUBLIC_BASE_URL: "http://localhost:3000" }, cron);
    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => !check.ok).map((check) => check.name)).toEqual(expect.arrayContaining([
      "production.database_ssl",
      "production.database_url",
      "production.claim_key",
      "production.public_base_url",
    ]));
  });

  it("allows the private Compose database to use its internal connection", () => {
    const result = verifyPreflight({
      ...production,
      DATABASE_URL: "postgresql://meaning_relay:secret@db:5432/meaning_relay",
      DATABASE_SSL: "disable",
    }, cron);

    expect(result.checks.find((check) => check.name === "production.database_ssl")?.ok).toBe(true);
  });

  it("keeps local in-memory mode available without production secrets", () => {
    const result = verifyPreflight({ NODE_ENV: "development", MAINTENANCE_TIMEOUT_MS: "15000" }, cron);
    expect(result.mode).toBe("local");
    expect(result.ok).toBe(true);
  });

  it("rejects a broken cron contract in every mode", () => {
    const result = verifyPreflight({ ...production }, { crons: [] });
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "cron.maintenance_path")?.ok).toBe(false);
  });

  it.each(["0", "99", "not-a-number", "1.5"])("rejects an invalid maintenance timeout: %s", (timeout) => {
    const result = verifyPreflight({ ...production, MAINTENANCE_TIMEOUT_MS: timeout }, cron);

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "maintenance.timeout")?.ok).toBe(false);
  });

  it("rejects localhost and non-HTTPS public base URLs in production", () => {
    const localhost = verifyPreflight({ ...production, PUBLIC_BASE_URL: "https://localhost:3000" }, cron);
    const insecure = verifyPreflight({ ...production, PUBLIC_BASE_URL: "http://relay.example.com" }, cron);

    expect(localhost.checks.find((check) => check.name === "production.public_base_url")?.ok).toBe(false);
    expect(insecure.checks.find((check) => check.name === "production.public_base_url")?.ok).toBe(false);
  });
});
