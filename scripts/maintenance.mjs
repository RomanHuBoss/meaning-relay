// Этот служебный сценарий выполняет проверяемую операцию обслуживания и возвращает явный результат для запуска и журналов.
/* global process, console, fetch, AbortSignal */

const endpoint = process.env.MAINTENANCE_URL ?? "http://localhost:3000/api/v1/internal/maintenance";
const secret = process.env.CRON_SECRET;
const timeoutMs = Number(process.env.MAINTENANCE_TIMEOUT_MS ?? 15_000);

if (!secret) {
  console.error("CRON_SECRET is required");
  process.exitCode = 1;
} else if (!Number.isInteger(timeoutMs) || timeoutMs < 100) {
  console.error("MAINTENANCE_TIMEOUT_MS must be an integer of at least 100 milliseconds");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    process.stdout.write(body + "\n");
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    const errorName = error instanceof Error && error.name.length > 0 ? error.name : "UnknownError";
    console.error(`Maintenance request failed: ${errorName}`);
    process.exitCode = 1;
  }
}
