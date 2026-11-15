// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const temporaryRoots: string[] = [];

async function runReadiness(env: Record<string, string | undefined> = {}) {
  try {
    const result = await run(process.execPath, ["scripts/verify-readiness.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
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

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PostgreSQL readiness verifier", () => {
  it("passes the checked-in migration, seed and env contract", async () => {
    const result = await runReadiness();
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ name: string; ok: boolean }> };
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThan(100);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it("fails when a fixture loses the migration transaction wrapper", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "meaning-relay-readiness-"));
    temporaryRoots.push(root);
    await mkdir(path.join(root, "migrations"), { recursive: true });
    await mkdir(path.join(root, "scripts"), { recursive: true });
    for (const relative of ["migrations/001_initial.sql", "scripts/seed.mjs", ".env.example"]) {
      await cp(path.join(process.cwd(), relative), path.join(root, relative));
    }
    const migrationPath = path.join(root, "migrations/001_initial.sql");
    const migration = await readFile(migrationPath, "utf8");
    await writeFile(migrationPath, migration.replace("BEGIN;", ""));

    const result = await runReadiness({ READINESS_ROOT: root });
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as { ok: boolean; checks: Array<{ name: string; ok: boolean }> };
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === "migration.transaction")?.ok).toBe(false);
  });
});
