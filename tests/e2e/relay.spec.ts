// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { randomUUID } from "node:crypto";

const cronSecret = "e2e-secret";
const validText = "Это достаточно длинный пересказ мысли для HTTP smoke сценария.";

async function getCsrf(api: import("@playwright/test").APIRequestContext): Promise<string> {
  const response = await api.get("/api/v1/csrf");
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { csrf: string };
  expect(body.csrf).toMatch(/^[A-Za-z0-9_-]{32,128}$/u);
  return body.csrf;
}

async function createSession(api: import("@playwright/test").APIRequestContext, csrf: string): Promise<void> {
  const response = await api.post("/api/v1/session", {
    headers: { "X-CSRF-Token": csrf },
    data: {},
  });
  expect(response.status()).toBe(201);
}

test("health and cron auth are reachable over HTTP", async ({ request }) => {
  const health = await request.get("/api/v1/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok" });

  const unauthorized = await request.post("/api/v1/internal/maintenance", { headers: { Authorization: "Bearer wrong-secret" } });
  expect(unauthorized.status()).toBe(401);
  expect((await unauthorized.json()).error.code).toBe("CRON_UNAUTHORIZED");
  const maintenance = await request.post("/api/v1/internal/maintenance", { headers: { Authorization: `Bearer ${cronSecret}` } });
  expect(maintenance.status()).toBe(200);
  expect(await maintenance.json()).toHaveProperty("counts");
});

test("public pages are reachable over HTTP", async ({ request }) => {
  for (const path of ["/", "/chains", "/map", "/about"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
});

test("session, CSRF, submit and invite continuation use the real HTTP flow", async ({ request }) => {
  const csrf = await getCsrf(request);
  await createSession(request, csrf);

  const start = await request.post("/api/v1/participation/start", {
    headers: { "X-CSRF-Token": csrf },
    data: { language: "ru", public_code: null, idempotency_key: randomUUID() },
  });
  expect(start.status()).toBe(201);
  const startBody = await start.json() as { chain: { public_code: string }; claim: { id: string; claim_token: string } };
  expect(startBody.claim.claim_token).toBeTruthy();

  const captchaResponse = await request.get(`/api/v1/captcha?claim_id=${startBody.claim.id}&locale=ru`);
  expect(captchaResponse.status()).toBe(200);
  const captchaBody = await captchaResponse.json() as { token: string; prompt: string };
  const operands = captchaBody.prompt.match(/(\d+)\s*\+\s*(\d+)/u);
  expect(operands).toBeTruthy();

  const submit = await request.post(`/api/v1/claims/${startBody.claim.id}/submit`, {
    headers: { "X-CSRF-Token": csrf },
    data: { claim_token: startBody.claim.claim_token, idempotency_key: randomUUID(), text: validText, country_code: null, captcha_token: captchaBody.token, captcha_answer: String(Number(operands?.[1]) + Number(operands?.[2])) },
  });
  expect(submit.status()).toBe(201);
  expect((await submit.json()).message.hop_index).toBe(1);

  const invitePage = await request.get(`/c/${startBody.chain.public_code}`);
  expect(invitePage.status()).toBe(200);

  const invited = await playwrightRequest.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const invitedCsrf = await getCsrf(invited);
    await createSession(invited, invitedCsrf);
    const invitedStart = await invited.post("/api/v1/participation/start", {
      headers: { "X-CSRF-Token": invitedCsrf },
      data: { language: "ru", public_code: startBody.chain.public_code, idempotency_key: randomUUID() },
    });
    expect(invitedStart.status()).toBe(201);
    expect((await invitedStart.json()).chain.public_code).toBe(startBody.chain.public_code);
  } finally {
    await invited.dispose();
  }
});

test("non-POST maintenance methods are rejected", async ({ request }) => {
  for (const method of ["GET", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await request.fetch("/api/v1/internal/maintenance", { method });
    expect(response.status(), method).toBe(405);
    expect((await response.json()).error.code, method).toBe("METHOD_NOT_ALLOWED");
  }

  const head = await request.fetch("/api/v1/internal/maintenance", { method: "HEAD" });
  expect(head.status()).toBe(405);
});

test.describe("browser public pages", () => {
  test.skip(!process.env.E2E_BROWSER, "Set E2E_BROWSER=1 in an environment with a runnable Chromium binary");

  test("render", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("meaning-relay:ui-locale", "ru"));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Передай мысль дальше." })).toBeVisible();
    await page.goto("/chains");
    await expect(page.getByRole("heading", { name: "Цепочки, которые дошли до конца." })).toBeVisible();
    await page.goto("/map");
    await expect(page.getByRole("heading", { name: "Сигнал по миру." })).toBeVisible();
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Смысл меняется, пока идёт дальше." })).toBeVisible();
  });
});
