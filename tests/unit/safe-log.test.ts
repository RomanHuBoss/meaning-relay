// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { afterEach, describe, expect, it, vi } from "vitest";
import { logSafeError } from "../../lib/http/safe-log";

describe("safe error logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes an operational marker without the error message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const error = new Error("private text and secret-token");
    error.name = "secret-token";
    logSafeError("relay.failed", error);

    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "relay.failed", error_name: "Error" }));
    expect(log.mock.calls[0]?.[0]).not.toContain("private text");
    expect(log.mock.calls[0]?.[0]).not.toContain("secret-token");
  });

  it("normalizes an untrusted event label", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logSafeError("secret-token", {});

    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "unknown", error_name: "UnknownError" }));
  });
});
