// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { describe, expect, it } from "vitest";
import { consumeRateLimit } from "../../lib/http/rate-limit";

describe("fixed window rate limits", () => {
  it("allows the configured start burst and rejects the next request", async () => {
    const scope = "rate-limit-test-" + Date.now();
    let last = await consumeRateLimit("START", scope);
    for (let index = 1; index < 20; index += 1) last = await consumeRateLimit("START", scope);
    expect(last.allowed).toBe(true);
    const rejected = await consumeRateLimit("START", scope);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("uses the stricter five-attempt, fifteen-minute admin login window", async () => {
    const scope = "admin-rate-limit-test-" + Date.now();
    let last = await consumeRateLimit("ADMIN_LOGIN", scope);
    for (let index = 1; index < 5; index += 1) last = await consumeRateLimit("ADMIN_LOGIN", scope);
    expect(last.allowed).toBe(true);
    const rejected = await consumeRateLimit("ADMIN_LOGIN", scope);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });
});
