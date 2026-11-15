// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "../../app/api/v1/internal/maintenance/route";
import { relayRuntime } from "../../lib/relay/runtime";

const secret = "maintenance-test-secret";

function request(method: string, authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/v1/internal/maintenance", {
    method,
    headers: authorization ? { authorization } : undefined,
  });
}

describe("maintenance route", () => {
  const previousSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = secret;
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it("rejects missing and invalid cron credentials without setting user cookies", async () => {
    const missing = await POST(request("POST"));
    expect(missing.status).toBe(401);
    expect((await missing.json()).error.code).toBe("CRON_UNAUTHORIZED");

    const invalid = await POST(request("POST", "Bearer wrong-secret"));
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["Basic maintenance-test-secret", "wrong scheme"],
    ["Bearer ", "empty value"],
    ["Bearer short", "different length"],
    ["bearer maintenance-test-secret", "wrong case"],
  ])("rejects malformed authorization header: %s (%s)", async (authorization) => {
    const response = await POST(request("POST", authorization));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("CRON_UNAUTHORIZED");
  });

  it("runs with the bearer secret and exposes the maintenance counts", async () => {
    const response = await POST(request("POST", `Bearer ${secret}`));
    expect(response.status).toBe(200);
    const body = await response.json() as { ran_at: string; counts: Record<string, number> };
    expect(Number.isNaN(Date.parse(body.ran_at))).toBe(false);
    expect(body.counts).toEqual({ expired_claims: 0, archived_chains: 0, cancelled_claims: 0, deleted_rows: 0 });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns a generic failure when maintenance storage throws", async () => {
    const maintenance = vi.spyOn(relayRuntime, "runMaintenance").mockRejectedValueOnce(new Error("private database details"));

    const response = await POST(request("POST", `Bearer ${secret}`));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({ code: "MAINTENANCE_FAILED", message: "Maintenance failed", retry_after_seconds: 0 });
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(JSON.stringify(body)).not.toContain("private database details");
    maintenance.mockRestore();
  });

  it.each([GET, PUT, PATCH, DELETE, HEAD, OPTIONS])("rejects non-POST methods", async (method) => {
    const response = await method();
    expect(response.status).toBe(405);
    expect((await response.json()).error.code).toBe("METHOD_NOT_ALLOWED");
  });
});
