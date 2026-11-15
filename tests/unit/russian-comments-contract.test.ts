// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

// Проверяем весь исполняемый исходный код, а не только несколько заранее
// выбранных модулей: новый файл без пояснения не должен незаметно появиться.
const sourceRoots = ["app", "components", "lib", "packages", "scripts", "tests", "migrations"];
const sourceExtensions = new Set([".ts", ".tsx", ".mjs", ".mts", ".sql"]);
const explicitSourceFiles = ["app/globals.css", "next.config.ts", "eslint.config.mjs", "vitest.config.ts", "vitest.integration.config.ts", "playwright.config.ts"];

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return sourceExtensions.has(path.extname(entry.name)) ? [relative] : [];
  });
}

function commentsFrom(source: string, sql = false): string[] {
  const comments: string[] = [];
  let block = false;
  let blockText = "";
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (block) {
      blockText += ` ${trimmed}`;
      if (trimmed.includes("*/")) {
        comments.push(blockText);
        block = false;
        blockText = "";
      }
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (trimmed.includes("*/")) comments.push(trimmed);
      else {
        block = true;
        blockText = trimmed;
      }
    } else if (trimmed.startsWith("//") || (sql && trimmed.startsWith("--"))) {
      comments.push(trimmed);
    }
  }
  return comments;
}

describe("контракт русскоязычных комментариев исходного кода", () => {
  it("имеет пояснение на русском в каждом исполняемом исходном модуле", () => {
    const files = [...sourceRoots.flatMap(sourceFiles), ...explicitSourceFiles];
    const missing = files.filter((file) => !commentsFrom(readFileSync(path.join(root, file), "utf8"), file.endsWith(".sql")).some((comment) => /[А-Яа-яЁё]/u.test(comment)));

    expect(missing).toEqual([]);
  });

  it("не оставляет англоязычные пояснения рядом с кодом", () => {
    const files = [...sourceRoots.flatMap(sourceFiles), ...explicitSourceFiles];
    const directives = /^\/\*\s*global\b|^\/\/\/\s*</iu;
    const nonRussian = files.flatMap((file) => commentsFrom(readFileSync(path.join(root, file), "utf8"), file.endsWith(".sql"))
      .filter((comment) => !directives.test(comment))
      .filter((comment) => !/[А-Яа-яЁё]/u.test(comment))
      .map((comment) => `${file}: ${comment}`));

    expect(nonRussian).toEqual([]);
  });
});
