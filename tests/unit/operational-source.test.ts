// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const maintenanceCli = readFileSync(path.join(root, "scripts/maintenance.mjs"), "utf8");
const postgresRelay = readFileSync(path.join(root, "lib/relay/postgres.ts"), "utf8");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as { crons?: Array<{ path?: string; schedule?: string }> };

describe("operational source contracts", () => {
  it("keeps the maintenance CLI bounded and operationally redacted", () => {
    expect(maintenanceCli).toMatch(/AbortSignal\.timeout\(timeoutMs\)/u);
    expect(maintenanceCli).toMatch(/timeoutMs\s*=\s*Number\(process\.env\.MAINTENANCE_TIMEOUT_MS \?\? 15_000\)/u);
    expect(maintenanceCli).toMatch(/timeoutMs < 100/u);
    expect(maintenanceCli).toMatch(/Maintenance request failed:\s*\$\{errorName\}/u);
    expect(maintenanceCli).not.toMatch(/console\.error\(error\)|console\.error\(error\.stack\)/u);
  });

  it("keeps maintenance transactions in parent-chain then claim lock order", () => {
    expect(postgresRelay).toMatch(/const expiry = await withTransaction\(async \(client\)/u);
    expect(postgresRelay).toMatch(/const archival = await withTransaction\(async \(client\)/u);
    expect(postgresRelay).toMatch(/deletedRows = await withTransaction\(async \(client\)/u);
    expect(postgresRelay).toMatch(/SELECT id FROM chains[\s\S]*?FOR UPDATE[\s\S]*?SELECT id FROM claims[\s\S]*?FOR UPDATE/u);
    expect(postgresRelay).toMatch(/active_token_ciphertext = NULL/u);
    expect(postgresRelay).toMatch(/DELETE FROM recoveries r USING claims c/u);
    expect(postgresRelay).toMatch(/DELETE FROM rate_limit_buckets/u);
    expect(postgresRelay).toMatch(/DELETE FROM country_events/u);
  });

  it("keeps Vercel maintenance cadence explicit", () => {
    expect(vercel.crons).toContainEqual({ path: "/api/v1/internal/maintenance", schedule: "* * * * *" });
  });
});
