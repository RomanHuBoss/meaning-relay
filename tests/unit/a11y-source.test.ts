// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
const relayApp = readFileSync(path.join(root, "components/relay-app.tsx"), "utf8");

describe("local UX and accessibility source contracts", () => {
  it("keeps keyboard focus visible and respects reduced motion", () => {
    expect(css).toMatch(/:focus-visible[\s\S]*outline:\s*3px solid var\(--accent\)/u);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  });

  it("protects narrow layouts from horizontal overflow", () => {
    expect(css).toMatch(/(?:html|body)\s*\{[^}]*overflow-x:\s*hidden/u);
    expect(css).toMatch(/@media\s*\(max-width:\s*360px\)/u);
    expect(css).toMatch(/\.reply-footer select\s*\{\s*width:\s*100%/u);
  });

  it("announces loading, countdown, and recoverable errors to assistive technology", () => {
    expect(relayApp).toMatch(/id="starting-heading"\s+role="status"\s+aria-live="polite"/u);
    expect(relayApp).toMatch(/className=\{seconds === 0 \? "warm" : ""\}\s+aria-live="polite"\s+aria-atomic="true"/u);
    expect(relayApp).toMatch(/aria-labelledby="error-heading"/u);
    expect(relayApp).toMatch(/<h2 id="error-heading">/u);
  });

  it("keeps the reply control explicitly associated with its label", () => {
    expect(relayApp).toMatch(/<label htmlFor="draft">[\s\S]*<textarea id="draft"/u);
    expect(relayApp).toMatch(/<select aria-label="Страна для карты"/u);
  });
});
