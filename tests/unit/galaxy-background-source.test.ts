// Этот тестовый модуль закрепляет декоративный фон и не даёт ему вмешиваться в содержание страницы.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");

describe("контракт звёздно-галактического фона", () => {
  it("выносит декоративный слой из дерева чтения и ввода", () => {
    expect(layout).toMatch(/<div className="galaxy-backdrop" aria-hidden="true">/u);
    expect(layout).toContain("galaxy-backdrop__stars");
    expect(layout).toContain("galaxy-backdrop__nebula");
    expect(layout).toContain("galaxy-backdrop__halo");
    expect(css).toMatch(/\.galaxy-backdrop\s*\{[^}]*pointer-events:\s*none/u);
    expect(css).toMatch(/body\s*>\s*\*:\s*not\(\.galaxy-backdrop\)\s*\{[^}]*z-index:\s*1/u);
  });

  it("ограничивает звёзды и туманность пределами окна и не создаёт горизонтальный скролл", () => {
    expect(css).toMatch(/\.galaxy-backdrop\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*overflow:\s*hidden/u);
    expect(css).toMatch(/\.galaxy-backdrop__nebula\s*\{[^}]*width:\s*min\(/u);
    expect(css).toMatch(/html\s*\{\s*overflow-x:\s*hidden/u);
    expect(css).toMatch(/body\s*\{\s*overflow-x:\s*hidden/u);
  });

  it("полностью отключает движение декоративных слоёв при reduced motion", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.galaxy-backdrop[\s\S]*animation:\s*none/u);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.galaxy-backdrop__stars[\s\S]*animation:\s*none/u);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.galaxy-backdrop__nebula[\s\S]*animation:\s*none/u);
  });
});
