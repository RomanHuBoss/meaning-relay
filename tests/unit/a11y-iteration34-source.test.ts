// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
const chainDetail = readFileSync(path.join(root, "components/chain-detail.tsx"), "utf8");
const adminPage = readFileSync(path.join(root, "app/admin/page.tsx"), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`Missing CSS color token --${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset + 1, offset + 3), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe("iteration 34 accessibility source contracts", () => {
  it("keeps focus indicators visible for native and scripted keyboard controls", () => {
    expect(css).toMatch(/:focus-visible[^{]*\{[^}]*outline:\s*3px solid var\(--accent\)/u);
    expect(css).toMatch(/\[tabindex\]:not\(\[tabindex="-1"\]\):focus-visible/u);
    expect(css).toMatch(/\.admin-tabs button:focus-visible/u);
  });

  it("audits core CSS text tokens against WCAG AA contrast thresholds", () => {
    const background = token("bg");
    const bodyText = token("ink");
    const mutedText = token("muted");
    const accentText = token("accent");

    expect(contrast(bodyText, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mutedText, background)).toBeGreaterThanOrEqual(4.5);
    // Акцентный цвет используется для подписей и состояний и сохраняет порог 3:1
    // для крупного текста и элементов управления.
    expect(contrast(accentText, background)).toBeGreaterThanOrEqual(3);
  });

  it("exposes keyboard-traversable admin tabs with labelled panels", () => {
    expect(adminPage).toMatch(/className="admin-tabs" role="tablist"/u);
    expect(adminPage).toMatch(/type="button" role="tab" id=\{`admin-tab-\$\{item\}`\}/u);
    expect(adminPage).toMatch(/aria-selected=\{tab === item\}/u);
    expect(adminPage).toMatch(/aria-controls=\{`admin-panel-\$\{item\}`\}/u);
    for (const panel of ["overview", "themes", "chains", "reports"]) {
      expect(adminPage).toContain(`id="admin-panel-${panel}" role="tabpanel" aria-labelledby="admin-tab-${panel}"`);
    }
    expect(adminPage).not.toMatch(/<button onClick=/u);
  });

  it("gives report disclosure controls and chain errors recoverable announcements", () => {
    expect(chainDetail).toMatch(/role="alert" aria-labelledby="chain-error-heading"/u);
    expect(chainDetail).toMatch(/<h1 id="chain-error-heading">/u);
    expect(chainDetail).toMatch(/className="primary-button" href="\/chains">Вернуться в галерею/u);
    expect(chainDetail).toMatch(/role="status" aria-live="polite" aria-labelledby="chain-loading-heading"/u);
    expect(chainDetail).toMatch(/aria-expanded=\{reportingMessageId === message\.id\}/u);
    expect(chainDetail).toMatch(/aria-controls=\{`report-form-\$\{message\.id\}`\}/u);
    expect(chainDetail).toMatch(/role="region" aria-labelledby=\{`report-toggle-\$\{message\.id\}`\}/u);
  });
});
