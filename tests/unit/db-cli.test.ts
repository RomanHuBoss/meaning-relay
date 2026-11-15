// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

async function runDatabaseCli(script: string) {
  try {
    const result = await run(process.execPath, [script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://127.0.0.1:1/meaning_relay",
        DATABASE_SSL: "disable",
      },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    };
  }
}

describe("database CLI failure paths", () => {
  it("redacts connection errors from migration output", async () => {
    const result = await runDatabaseCli("scripts/migrate.mjs");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('{"event":"migration.failed","error_name":"Error"}');
    expect(result.stderr).not.toContain("127.0.0.1");
    expect(result.stderr).not.toContain("ECONNREFUSED");
  });

  it("redacts connection errors from seed output", async () => {
    const result = await runDatabaseCli("scripts/seed.mjs");

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('{"event":"seed.failed","error_name":"Error"}');
    expect(result.stderr).not.toContain("127.0.0.1");
    expect(result.stderr).not.toContain("ECONNREFUSED");
  });
});
