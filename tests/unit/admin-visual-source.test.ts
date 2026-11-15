// Этот тестовый модуль фиксирует понятность административного интерфейса и его пустых состояний.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "app/admin/page.tsx"), "utf8");

describe("локальный контракт административного интерфейса", () => {
  it("сохраняет русские подписи и явные связи полей формы", () => {
    expect(source).toContain("КОНТУР ОПЕРАЦИЙ");
    expect(source).toMatch(/htmlFor="theme-slug"[\s\S]*id="theme-slug"/u);
    expect(source).toMatch(/htmlFor="theme-seed-ru"[\s\S]*id="theme-seed-ru"/u);
    expect(source).toMatch(/htmlFor="theme-seed-en"[\s\S]*id="theme-seed-en"/u);
    expect(source).toContain("Исходный текст RU");
    expect(source).toContain("Исходный текст EN");
  });

  it("помечает загрузку и сообщения результата для вспомогательных технологий", () => {
    expect(source).toMatch(/<main className="site-shell admin-shell" aria-busy=\{loading\}>/u);
    expect(source).toMatch(/className="loading-note" role="status" aria-live="polite"/u);
    expect(source).toMatch(/className="admin-success" role="status" aria-live="polite"/u);
  });

  it("не оставляет пустыми списки тем и цепочек", () => {
    expect(source).toContain("Тем пока нет.");
    expect(source).toContain("Цепочек пока нет.");
    expect(source).toContain("Открытых жалоб нет.");
  });
});
