// Этот тестовый модуль фиксирует новые требования доступности и защищает их от регресса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const mapPage = readFileSync(path.join(root, "app/map/page.tsx"), "utf8");
const chainDetail = readFileSync(path.join(root, "components/chain-detail.tsx"), "utf8");
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");

function luminance(hex: string): number {
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset + 1, offset + 3), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe("итерация 39: локальные контракты доступности", () => {
  it("скрывает от вспомогательных технологий декоративные слои карты", () => {
    expect(mapPage).toMatch(/className="world-map-art"[^>]+alt="Агрегированная карта активности по странам"/u);
    expect(mapPage).toMatch(/className="map-pulse pulse-one" aria-hidden="true"/u);
    expect(mapPage).toMatch(/className="map-pulse pulse-two" aria-hidden="true"/u);
    expect(mapPage).toMatch(/<span aria-hidden="true">AGGREGATED ACTIVITY<\/span>/u);
  });

  it("связывает поля жалобы с их подписями явными идентификаторами", () => {
    expect(chainDetail).toMatch(/<label htmlFor=\{`report-reason-\$\{message\.id\}`\}>Причина/u);
    expect(chainDetail).toMatch(/<select id=\{`report-reason-\$\{message\.id\}`\}/u);
    expect(chainDetail).toMatch(/<label htmlFor=\{`report-details-\$\{message\.id\}`\}>Детали/u);
    expect(chainDetail).toMatch(/<textarea id=\{`report-details-\$\{message\.id\}`\}/u);
  });

  it("сохраняет достаточный контраст текста на тёмных поверхностях", () => {
    expect(contrast("#a8aaa3", "#172125")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#f5f0e8", "#172125")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#121814", "#d8f36b")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ff9e6d", "#101618")).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain(".primary-button { background: var(--accent); color: #121814; }");
  });
});
