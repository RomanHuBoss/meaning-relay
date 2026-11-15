// Этот тестовый модуль закрепляет границу между пользовательским текстом и исполняемой разметкой.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publicMessageText } from "../../lib/http/public-chain";

const root = process.cwd();
const sourceRoots = ["app", "components", "lib", "scripts", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".mjs", ".mts"]);
const forbiddenPatterns = [
  /dangerouslySetInnerHTML/u,
  /\.innerHTML\s*=/u,
  /document\.write\s*\(/u,
  /\beval\s*\(/u,
  /new Function\s*\(/u,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return sourceExtensions.has(path.extname(entry.name)) ? [relative] : [];
  });
}

describe("контракты безопасной публичной сериализации", () => {
  it("не допускает опасную разметку и динамическое выполнение в исходниках", () => {
    for (const file of sourceRoots.flatMap(sourceFiles)) {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const pattern of forbiddenPatterns) expect(source, file).not.toMatch(pattern);
    }
  });

  it("передаёт разрешённый текст как данные и заменяет скрытый текст", () => {
    const markup = "<script>alert('xss')</script>";

    expect(publicMessageText({ text: markup, moderationStatus: "ALLOWED" })).toBe(markup);
    expect(publicMessageText({ text: markup, moderationStatus: "HIDDEN" })).toBe("[сообщение скрыто модератором]");
    expect(JSON.stringify({ text: markup })).toContain(markup);
  });

  it("не разрешает сериализатору административной цепочки копировать внутренние поля", () => {
    const source = readFileSync(path.join(root, "lib/http/admin-routes.ts"), "utf8");

    expect(source).toMatch(/messages: chain\.messages\.map\(\(message\) => \(\{/u);
    expect(source).not.toMatch(/messages: chain\.messages\.map\(\(message\) => \(\{\s*\.\.\.message/u);
  });
});
