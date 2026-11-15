// Этот служебный сценарий выполняет проверяемую операцию обслуживания и возвращает явный результат для запуска и журналов.
/* global process, console, URL */

import { readFile } from "node:fs/promises";
import pg from "pg";
import { logSafeError } from "./safe-error.mjs";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  let client;
  try {
    const sql = await readFile(new URL("../migrations/001_initial.sql", import.meta.url), "utf8");
    client = await pool.connect();
    await client.query(sql);
    console.log(JSON.stringify({ applied: ["001_initial.sql"] }));
  } catch (error) {
    logSafeError("migration.failed", error);
    process.exitCode = 1;
  } finally {
    client?.release();
    try {
      await pool.end();
    } catch (error) {
      logSafeError("migration.pool_close_failed", error);
      process.exitCode = 1;
    }
  }
}
