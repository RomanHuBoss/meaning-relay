// Этот тест фиксирует единый безопасный конверт ошибок для каждого HTTP-маршрута.
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requestErrorResponse, storageUnavailableResponse } from "../../lib/http/errors";

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("единый конверт HTTP-ошибки", () => {
  it("добавляет идентификатор обращения и нулевое время повтора", async () => {
    const response = requestErrorResponse("INVALID_BODY", 422, "Request body is invalid");
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatchObject({
      code: "INVALID_BODY",
      message: "Request body is invalid",
      retry_after_seconds: 0,
    });
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(response.headers.get("Retry-After")).toBeNull();
  });

  it("добавляет Retry-After только для временного ограничения", async () => {
    const response = requestErrorResponse("RATE_LIMITED", 429, "Too many requests", 37);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(body.error.retry_after_seconds).toBe(37);
  });

  it("возвращает одинаковый формат при недоступности административного хранилища", async () => {
    const response = storageUnavailableResponse();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Administrative storage is unavailable",
      retry_after_seconds: 0,
    });
    expect(body.error.request_id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("не привязывает публичный конверт к содержимому запроса", () => {
    const request = new NextRequest("http://localhost/api/v1/health", { headers: { authorization: "Bearer secret" } });
    const response = requestErrorResponse("INTERNAL_ERROR", 500, "Internal server error");

    expect(request.headers.get("authorization")).toBe("Bearer secret");
    expect(response.headers.get("authorization")).toBeNull();
  });

  it("не оставляет в маршрутах старый ответ без request_id", () => {
    const incomplete = routeFiles(join(process.cwd(), "app/api")).filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("NextResponse.json") && source.includes("error:") && !source.includes("request_id");
    });

    expect(incomplete).toEqual([]);
  });
});
