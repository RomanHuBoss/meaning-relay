// Этот тестовый модуль фиксирует защиту узких экранов от переполнения интерфейса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
const adminPage = readFileSync(path.join(root, "app/admin/page.tsx"), "utf8");

describe("итерация 41: адаптивный каркас интерфейса", () => {
  it("переносит верхнюю панель и административные действия на узком экране", () => {
    expect(css).toContain(".topbar { flex-wrap: wrap; }");
    expect(css).toContain(".admin-actions { flex-wrap: wrap; }");
    expect(css).toContain(".admin-actions { width: 100%; justify-content: flex-start; }");
  });

  it("сохраняет читаемость административного заголовка на 320 пикселях", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*\.wordmark\s*\{\s*overflow-wrap:\s*anywhere/u);
    expect(adminPage).toContain("СМЫСЛОВОЙ ТЕЛЕФОН · ADMIN");
    expect(adminPage).toContain("className=\"admin-actions\"");
  });

  it("не убирает защиту от горизонтального переполнения", () => {
    expect(css).toMatch(/html\s*\{\s*overflow-x:\s*hidden/u);
    expect(css).toMatch(/body\s*\{\s*overflow-x:\s*hidden/u);
    expect(css).toMatch(/@media\s*\(max-width:\s*360px\)/u);
  });

  it("переносит длинные заголовки внутри карточек и панелей", () => {
    expect(css).toContain("h1, h2 { overflow-wrap: anywhere; }");
  });
});
