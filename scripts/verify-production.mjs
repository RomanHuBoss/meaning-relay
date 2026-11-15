// Этот служебный сценарий выполняет проверяемую операцию обслуживания и возвращает явный результат для запуска и журналов.
/* global process, console, URL, Buffer */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const maintenancePath = "/api/v1/internal/maintenance";

function check(name, ok, detail, severity = "error") {
  return { name, ok, detail, severity };
}

function nonPlaceholder(value, minimum) {
  return typeof value === "string" && value.length >= minimum && !/(replace-with|base64-encoded|password@localhost)/iu.test(value);
}

function isBase64Bytes(value, expectedBytes) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) return false;
  try {
    return Buffer.from(value, "base64").length === expectedBytes;
  } catch {
    return false;
  }
}

function validUrl(value, protocol, rejectLocalhost = false) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== protocol) return false;
    return !rejectLocalhost || !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function validDatabaseUrl(value) {
  try {
    const parsed = new URL(value);
    return ["postgres:", "postgresql:"].includes(parsed.protocol)
      && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
      && !/(password@|replace-with)/iu.test(value);
  } catch {
    return false;
  }
}

function internalComposeDatabase(value) {
  try {
    return new URL(value).hostname === "db";
  } catch {
    return false;
  }
}

function cronContract(vercel) {
  const cron = Array.isArray(vercel?.crons) ? vercel.crons.find((entry) => entry?.path === maintenancePath) : undefined;
  return Boolean(cron && cron.schedule === "* * * * *");
}

export function verifyPreflight(env, vercel) {
  const production = env.NODE_ENV === "production";
  const checks = [
    check("cron.maintenance_path", cronContract(vercel), `${maintenancePath} is scheduled`),
    check("maintenance.timeout", Number.isInteger(Number(env.MAINTENANCE_TIMEOUT_MS ?? 15_000)) && Number(env.MAINTENANCE_TIMEOUT_MS ?? 15_000) >= 100, "maintenance timeout is at least 100 ms"),
  ];

  if (!production) {
    checks.push(check("local.mode", true, "non-production preflight keeps the in-memory fallback available", "info"));
    return { mode: "local", ok: checks.every((item) => item.ok), checks };
  }

  checks.push(
    check("production.database_url", validDatabaseUrl(env.DATABASE_URL), "DATABASE_URL is a non-placeholder non-local PostgreSQL URL"),
    check(
      "production.database_ssl",
      env.DATABASE_SSL !== "disable" || internalComposeDatabase(env.DATABASE_URL),
      "DATABASE_SSL requires TLS unless PostgreSQL is the private Compose db service",
    ),
    check("production.claim_key", isBase64Bytes(env.CLAIM_TOKEN_ENCRYPTION_KEY, 32), "claim token key is exactly 32 decoded bytes"),
    check("production.sid_pepper", nonPlaceholder(env.SID_PEPPER, 32), "SID_PEPPER is a non-placeholder secret"),
    check("production.admin_key", nonPlaceholder(env.ADMIN_KEY, 32), "ADMIN_KEY is a non-placeholder secret"),
    check("production.cron_secret", nonPlaceholder(env.CRON_SECRET, 32), "CRON_SECRET is a non-placeholder secret"),
    check("production.public_base_url", validUrl(env.PUBLIC_BASE_URL, "https:", true), "PUBLIC_BASE_URL is an external HTTPS URL"),
    check("production.privacy_operator", Boolean(env.PRIVACY_OPERATOR_NAME?.trim()), "privacy operator name is configured"),
    check("production.privacy_contact", Boolean(env.PRIVACY_CONTACT_EMAIL?.trim()), "privacy contact is configured"),
    check("production.moderation_contact", Boolean(env.MODERATION_CONTACT_EMAIL?.trim()), "moderation contact is configured"),
  );

  return { mode: "production", ok: checks.every((item) => item.ok), checks };
}

export async function readPreflight(root = process.env.PREFLIGHT_ROOT ?? projectRoot) {
  const vercel = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
  return verifyPreflight(process.env, vercel);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await readPreflight();
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ error: "PreflightUnavailable" }));
    process.exitCode = 1;
  }
}
