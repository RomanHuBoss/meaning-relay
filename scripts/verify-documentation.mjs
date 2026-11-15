// Этот служебный сценарий выполняет проверяемую операцию обслуживания и возвращает явный результат для запуска и журналов.
/* global process, console, URL */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

const requiredCommands = [
  "migrate",
  "seed",
  "verify:readiness",
  "verify:production",
  "verify:documentation",
  "maintenance",
  "test:postgres",
  "test:e2e",
];

const requiredReadmeFragments = [
  "GET /api/health",
  "POST /api/v1/internal/maintenance",
  "npm run migrate",
  "npm run seed",
  "npm run verify:readiness",
  "npm run verify:production",
  "npm run maintenance",
  "DATABASE_URL",
  "CLAIM_TOKEN_ENCRYPTION_KEY",
];

const requiredEnvironmentKeys = [
  "NODE_ENV",
  "POSTGRES_PASSWORD",
  "DATABASE_URL",
  "DATABASE_SSL",
  "DB_POOL_MAX",
  "SID_PEPPER",
  "ADMIN_KEY",
  "CRON_SECRET",
  "MAINTENANCE_TIMEOUT_MS",
  "PUBLIC_BASE_URL",
  "PRIVACY_OPERATOR_NAME",
  "PRIVACY_CONTACT_EMAIL",
  "MODERATION_CONTACT_EMAIL",
  "MAP_ENABLED",
  "CLAIM_TOKEN_ENCRYPTION_KEY",
];

function check(name, ok, detail) {
  return { name, ok, detail };
}

function mentionsCommand(readme, command) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_-])npm run ${escaped}(?![A-Za-z0-9_-])`, "u").test(readme);
}

/**
 * Проверяет, что инструкция для развёртывания не отстала от исполняемого проекта.
 * Такая проверка нужна потому, что устаревший README опаснее отсутствующего:
 * оператор запускает формально известную команду и получает неполный контур.
 */
export function verifyDocumentation({ readme, packageJson, envExample }) {
  const checks = [];
  const scripts = packageJson?.scripts ?? {};

  for (const command of requiredCommands) {
    checks.push(check(
      `package.script.${command}`,
      typeof scripts[command] === "string" && mentionsCommand(readme, command),
      `package script ${command} exists and is documented`,
    ));
  }

  for (const fragment of requiredReadmeFragments) {
    checks.push(check(
      `readme.fragment.${fragment}`,
      readme.includes(fragment),
      `README contains ${fragment}`,
    ));
  }

  for (const variable of requiredEnvironmentKeys) {
    checks.push(check(
      `env.example.${variable}`,
      new RegExp(`^${variable}=`, "m").test(envExample),
      `${variable} is present in .env.example`,
    ));
  }

  // В репозитории не должны оставаться незаполненные обещания оператору.
  checks.push(check(
    "readme.no_placeholder_markers",
    !/\b(?:TODO|TBD|FIXME)\b/u.test(readme),
    "README has no unfinished placeholder markers",
  ));

  return { ok: checks.every((item) => item.ok), checks };
}

export async function readDocumentation(root = process.env.DOCUMENTATION_ROOT ?? projectRoot) {
  const [readme, packageText, envExample] = await Promise.all([
    readFile(path.join(root, "README.md"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, ".env.example"), "utf8"),
  ]);
  return verifyDocumentation({ readme, packageJson: JSON.parse(packageText), envExample });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await readDocumentation();
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ error: "DocumentationUnavailable" }));
    process.exitCode = 1;
  }
}
