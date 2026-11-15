// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "lib/relay/postgres.ts"), "utf8");

describe("PostgreSQL relay source contracts", () => {
  it("applies the active-chain cap per requested language", () => {
    expect(source).toMatch(/SELECT count\(\*\)::int AS count FROM chains WHERE language = \$1 AND status = 'ACTIVE'/u);
    expect(source).toMatch(/activeCount\s*=\s*await client\.query\([\s\S]*?\[language\][\s\S]*?\);/u);
  });
});
