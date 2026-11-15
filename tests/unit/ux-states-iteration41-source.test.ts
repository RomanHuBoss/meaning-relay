// Этот тестовый модуль фиксирует видимые переходы пользовательского хода.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "components/relay-app.tsx"), "utf8");

describe("итерация 41: состояния пользовательского хода", () => {
  it("сохраняет серверный таймер в 180 секунд после нового старта и перезагрузки", () => {
    expect(source).toMatch(/const TURN_TIMER_SECONDS = CLAIM_TTL_SECONDS/u);
    expect(source).toMatch(/setSeconds\(TURN_TIMER_SECONDS\)/u);
    expect(source).toMatch(/Math\.min\(TURN_TIMER_SECONDS, Math\.max\(0, Math\.ceil\(\(expiresAt - Date\.now\(\)\) \/ 1000\)\)\)/u);
  });

  it("блокирует отправку после истечения серверного таймера", () => {
    expect(source).toMatch(/disabled=\{submitting \|\| seconds <= 0 \|\| counter < 20\}/u);
    expect(source).toMatch(/seconds <= 0 \? "Время вышло"/u);
  });

  it("сохраняет loading, recoverable error и completed экраны", () => {
    expect(source).toMatch(/view === "starting"/u);
    expect(source).toMatch(/view === "error"/u);
    expect(source).toMatch(/submitResult\.completed/u);
    expect(source).toMatch(/role="status" aria-live="polite"/u);
  });
});
