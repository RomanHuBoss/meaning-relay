// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { createServer, type RequestListener, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const servers: Server[] = [];

async function runMaintenance(env: Record<string, string | undefined>) {
  try {
    const result = await run(process.execPath, ["scripts/maintenance.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? "",
    };
  }
}

async function listen(handler: RequestListener): Promise<{ url: string; server: Server }> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to determine test server address");
  return { url: `http://127.0.0.1:${address.port}/api/v1/internal/maintenance`, server };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

describe("maintenance CLI", () => {
  it("fails before making a request when CRON_SECRET is missing", async () => {
    const result = await runMaintenance({ CRON_SECRET: undefined, MAINTENANCE_URL: "http://127.0.0.1:1" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CRON_SECRET is required");
  });

  it("sends POST with the cron secret and prints the response", async () => {
    const requests: { method?: string; authorization?: string }[] = [];
    const { url } = await listen((request, response) => {
      requests.push({ method: request.method, authorization: request.headers.authorization });
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"counts":{"expired_claims":0}}');
    });
    const result = await runMaintenance({ CRON_SECRET: "test-secret", MAINTENANCE_URL: url });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"expired_claims":0');
    expect(requests).toEqual([{ method: "POST", authorization: "Bearer test-secret" }]);
  });

  it("fails with a bounded timeout when the endpoint does not respond", async () => {
    const { url } = await listen(() => undefined);
    const result = await runMaintenance({ CRON_SECRET: "test-secret", MAINTENANCE_URL: url, MAINTENANCE_TIMEOUT_MS: "100" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Maintenance request failed:");
  });
});
