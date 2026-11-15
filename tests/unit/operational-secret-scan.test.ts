// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const roots = ["app", "lib", "packages", "scripts"];
const sourceExtensions = new Set([".ts", ".tsx", ".mjs", ".mts"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return sourceExtensions.has(path.extname(entry.name)) ? [relative] : [];
  });
}

describe("эксплуатационный контроль секретов в журналах", () => {
  it("не сериализует исключение, его стек или значение секрета напрямую", () => {
    const forbidden = [
      /console\.(?:error|warn|log)\(\s*error(?:\.stack)?\s*\)/u,
      /console\.(?:error|warn|log)\([^\n]*JSON\.stringify\(error\)/u,
      /console\.(?:error|warn|log)\([^\n]*process\.env\.(?:DATABASE_URL|SID_PEPPER|ADMIN_KEY|CRON_SECRET|CLAIM_TOKEN_ENCRYPTION_KEY)/u,
    ];

    for (const file of roots.flatMap(sourceFiles)) {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const pattern of forbidden) expect(source, file).not.toMatch(pattern);
    }
  });

  it("оставляет безопасный формат общего журналирования неизменным", () => {
    const serverLogger = readFileSync(path.join(root, "lib/http/safe-log.ts"), "utf8");
    const cliLogger = readFileSync(path.join(root, "scripts/safe-error.mjs"), "utf8");

    for (const source of [serverLogger, cliLogger]) {
      expect(source).toContain("error_name");
      expect(source).toContain("safeEvent");
      expect(source).not.toMatch(/error\.message|error\.stack|JSON\.stringify\(error\)/u);
    }
  });
});
