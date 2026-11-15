// Этот сценарий повторяет адаптивный аудит публичных экранов и сохраняет проверяемые снимки.
/* global process, console, document, getComputedStyle, innerWidth, innerHeight */

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3200";
const outputDir = path.resolve("artifacts/mobile-audit");
const viewports = [
  [320, 800],
  [375, 812],
  [390, 844],
  [412, 915],
];
const routes = ["/", "/?join=1", "/chains", "/map", "/about"];

function fileSlug(route) {
  return route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const offscreen = [];
    for (const element of document.querySelectorAll("a, button, input, select, textarea")) {
      if (!isVisible(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.left < -1 || rect.right > innerWidth + 1) {
        offscreen.push({
          tag: element.tagName,
          text: (element.textContent ?? "").trim().slice(0, 60),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        });
      }
    }
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      offscreen,
      title: document.title,
    };
  });
}

async function capture(browser, width, height, route) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? "failed"}`));

  const slug = fileSlug(route);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 20_000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outputDir, `${width}x${height}-${slug}.png`), fullPage: true });
  const metrics = await inspectPage(page);
  await page.close();
  return { width, height, route, metrics, errors, failedRequests };
}

async function captureTurn(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/?join=1`, { waitUntil: "networkidle", timeout: 20_000 });
  await page.locator(".language-actions .primary-button").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, `${width}x${height}-turn.png`), fullPage: true });
  const metrics = await inspectPage(page);
  await page.close();
  return { width, height, route: "turn", metrics, errors, failedRequests: [] };
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const [width, height] of viewports) {
  for (const route of routes) results.push(await capture(browser, width, height, route));
  results.push(await captureTurn(browser, width, height));
}
await browser.close();

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  results,
  failures: results.filter((result) => result.metrics.horizontalOverflow || result.metrics.offscreen.length || result.errors.length || result.failedRequests.length),
};
await fs.writeFile(path.join(outputDir, "metrics-final.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ results: results.length, failures: summary.failures.length, outputDir }, null, 2));
if (summary.failures.length) process.exitCode = 1;
