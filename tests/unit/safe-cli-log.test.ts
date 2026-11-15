// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("safe CLI error logging", () => {
  it("emits only the event and error class", async () => {
    const result = await run(process.execPath, [
      "--input-type=module",
      "-e",
      "import { logSafeError } from './scripts/safe-error.mjs'; const error = new Error('private SQL and secret-token'); error.name = 'secret-token'; logSafeError('seed.failed', error);",
    ], { cwd: process.cwd() });

    expect(result.stderr).toContain('"event":"seed.failed"');
    expect(result.stderr).toContain('"error_name":"Error"');
    expect(result.stderr).not.toContain("private SQL");
    expect(result.stderr).not.toContain("secret-token");
  });

  it("normalizes an untrusted event label", async () => {
    const result = await run(process.execPath, [
      "--input-type=module",
      "-e",
      "import { logSafeError } from './scripts/safe-error.mjs'; logSafeError('secret-token', {});",
    ], { cwd: process.cwd() });

    expect(result.stderr.trim()).toBe('{"event":"unknown","error_name":"UnknownError"}');
  });
});
