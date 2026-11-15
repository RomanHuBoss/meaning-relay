// Этот служебный сценарий выполняет проверяемую операцию обслуживания и возвращает явный результат для запуска и журналов.
/* global process, console, URL */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const defaultRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

const requiredTables = [
  "themes",
  "chains",
  "sessions",
  "admin_sessions",
  "messages",
  "claims",
  "participation_starts",
  "recoveries",
  "reports",
  "country_events",
  "events",
  "rate_limit_buckets",
];

const requiredColumns = {
  themes: ["slug", "title_ru", "title_en", "seed_text_ru", "seed_text_en", "status"],
  chains: ["public_code", "theme_id", "theme_title_snapshot", "seed_text_snapshot", "language", "target_hops", "current_hop", "status", "created_at", "updated_at", "last_activity_at"],
  sessions: ["sid_hash", "created_at", "expires_at", "last_seen_at"],
  admin_sessions: ["token_hash", "created_at", "expires_at"],
  messages: ["chain_id", "hop_index", "text", "word_count", "text_hash", "session_hash", "moderation_status", "created_at"],
  claims: ["chain_id", "hop_index", "session_hash", "claim_token_hash", "status", "claimed_at", "expires_at"],
  participation_starts: ["session_hash", "idempotency_key", "request_hash", "chain_id", "claim_id", "created_at"],
  recoveries: ["session_hash", "claim_id", "recover_idempotency_key", "request_hash", "token_ciphertext", "status", "created_at"],
  reports: ["message_id", "reporter_hash", "reason", "status", "created_at"],
  country_events: ["day_utc", "event_type", "created_at"],
  events: ["event_type", "metadata", "created_at"],
  rate_limit_buckets: ["scope_hash", "limit_kind", "bucket_start", "count", "expires_at"],
};

function check(name, ok, detail) {
  return { name, ok, detail };
}

function tableBlock(sql, table) {
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`, "i"));
  return match?.[1] ?? "";
}

function hasColumnConstraint(block, column) {
  const line = block.split("\n").find((candidate) => new RegExp(`^\\s*${column}\\s`, "i").test(candidate));
  return Boolean(line && (/\bNOT NULL\b/i.test(line) || /\bPRIMARY KEY\b/i.test(line)));
}

export function verifyReadiness({ migration, seed, env }) {
  const checks = [];
  checks.push(check("migration.transaction", /^\s*BEGIN;[\s\S]*COMMIT;\s*$/i.test(migration), "migration is wrapped in BEGIN/COMMIT"));

  for (const table of requiredTables) {
    const block = tableBlock(migration, table);
    checks.push(check(`migration.table.${table}`, block.length > 0, `table ${table} exists`));
    for (const column of requiredColumns[table]) {
      checks.push(check(`migration.not_null.${table}.${column}`, hasColumnConstraint(block, column), `${table}.${column} is NOT NULL or PRIMARY KEY`));
    }
  }

  for (const index of [
    "claims_active_chain_hop_uidx",
    "claims_active_session_uidx",
    "claims_session_idempotency_uidx",
    "recoveries_active_claim_uidx",
  ]) {
    checks.push(check(`migration.index.${index}`, migration.includes(index), `index ${index} exists`));
  }
  for (const constraint of [
    "UNIQUE (chain_id, hop_index)",
    "UNIQUE (chain_id, session_hash)",
    "UNIQUE (session_hash, idempotency_key)",
  ]) {
    checks.push(check(`migration.constraint.${constraint}`, migration.includes(constraint), `${constraint} exists`));
  }

  for (const marker of [
    "ON CONFLICT (slug) DO UPDATE",
    'for (const language of ["ru", "en", "zh", "fr", "hi", "es"])',
    "Math.max(0, 4 -",
    "> 50",
    "target_hops)",
  ]) {
    checks.push(check(`seed.marker.${marker}`, seed.includes(marker), `seed contains ${marker}`));
  }
  checks.push(check("seed.themes", (seed.match(/slug:/g) ?? []).length === 5, "seed defines five canonical themes"));

  const requiredEnv = [
    "NODE_ENV",
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
  for (const variable of requiredEnv) {
    checks.push(check(`env.${variable}`, new RegExp(`^${variable}=`, "m").test(env), `${variable} is documented in .env.example`));
  }

  return {
    ok: checks.every((item) => item.ok),
    checks,
  };
}

export async function readReadiness(root = process.env.READINESS_ROOT ?? defaultRoot) {
  const [migration, seed, env] = await Promise.all([
    readFile(path.join(root, "migrations/001_initial.sql"), "utf8"),
    readFile(path.join(root, "scripts/seed.mjs"), "utf8"),
    readFile(path.join(root, ".env.example"), "utf8"),
  ]);
  return verifyReadiness({ migration, seed, env });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await readReadiness();
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ error: error instanceof Error ? "Error" : "UnknownError" }));
    process.exitCode = 1;
  }
}
