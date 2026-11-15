// Эта конфигурация задаёт HTTP-сценарии и браузерные проверки приложения.
import { chromium, defineConfig } from "@playwright/test";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? chromium.executablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--single-process"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    // Секрет передаётся через env, чтобы команда одинаково работала в Windows и Unix CI.
    command: `${npmCommand} run dev -- --hostname 127.0.0.1 --port 3100`,
    env: { ...process.env, CRON_SECRET: "e2e-secret" },
    url: "http://127.0.0.1:3100/api/v1/health",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
