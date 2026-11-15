// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyDocumentation } from "../../scripts/verify-documentation.mjs";

const root = process.cwd();

async function readProjectFiles() {
  const [readme, packageText, envExample] = await Promise.all([
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, ".env.example"), "utf8"),
  ]);
  return { readme, packageJson: JSON.parse(packageText) as { scripts?: Record<string, string> }, envExample };
}

describe("контракт эксплуатационной документации", () => {
  it("синхронизирует README, package.json и .env.example", async () => {
    const result = verifyDocumentation(await readProjectFiles());

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("отказывает при исчезновении эксплуатационной команды или обязательной переменной", async () => {
    const files = await readProjectFiles();
    const result = verifyDocumentation({
      ...files,
      readme: files.readme.replaceAll("npm run verify:production", "npm run verify:production-removed"),
      envExample: files.envExample.replace("CRON_SECRET=", "CRON_SECRET_REMOVED="),
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "package.script.verify:production")?.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "env.example.CRON_SECRET")?.ok).toBe(false);
  });

  it("отмечает незаполненный маркер в README как ошибку", async () => {
    const files = await readProjectFiles();
    const result = verifyDocumentation({ ...files, readme: `${files.readme}\nTODO: убрать временное описание\n` });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "readme.no_placeholder_markers")?.ok).toBe(false);
  });
});
