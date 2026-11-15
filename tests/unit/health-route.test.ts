// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("../../lib/db/pool", () => ({
  getPool: () => ({ query: poolQuery }),
}));

import { GET } from "../../app/api/v1/health/route";

describe("database health route", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    poolQuery.mockReset();
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("reports local in-memory mode without opening a database connection", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "not_configured" });
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("reports database availability only after SELECT 1 succeeds", async () => {
    process.env.DATABASE_URL = "postgresql://health-test";
    poolQuery.mockResolvedValue({ rows: [{ one: 1 }] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
    expect(poolQuery).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns a generic 503 contract when the database is unavailable", async () => {
    process.env.DATABASE_URL = "postgresql://health-test";
    poolQuery.mockRejectedValue(new Error("password=private-secret"));

    const response = await GET();
    const body = await response.json() as { error: { code: string; message: string; request_id: string; retry_after_seconds: number } };

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({ code: "HEALTH_UNAVAILABLE", message: "Service unavailable", retry_after_seconds: 30 });
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(JSON.stringify(body)).not.toContain("private-secret");
  });
});
