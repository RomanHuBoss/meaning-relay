// Загружает сгенерированный пул стартовых мыслей в существующую таблицу тем.
/* global process, console */

import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import pg from "pg";
import { logSafeError } from "./safe-error.mjs";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exitCode = 1;
} else {
  const sourcePath = process.argv[2] ?? "../data/starter-phrases.json";
  const phrases = JSON.parse(await readFile(new URL(sourcePath, import.meta.url), "utf8"));
  const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    for (const phrase of phrases) {
      await client.query(
        "INSERT INTO themes (slug, title_ru, title_en, seed_text_ru, seed_text_en, status) " +
        "VALUES ($1, $2, $3, $4, $5, 'ACTIVE') " +
        "ON CONFLICT (slug) DO UPDATE SET title_ru = EXCLUDED.title_ru, title_en = EXCLUDED.title_en, " +
        "seed_text_ru = EXCLUDED.seed_text_ru, seed_text_en = EXCLUDED.seed_text_en, status = 'ACTIVE', updated_at = now()",
        [phrase.slug, phrase.title_ru, phrase.title_en, phrase.seed_text_ru, phrase.seed_text_en],
      );
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ loaded: phrases.length }));
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logSafeError("phrase_seed.rollback_failed", rollbackError);
      }
    }
    logSafeError("phrase_seed.failed", error);
    process.exitCode = 1;
  } finally {
    client?.release();
    try {
      await pool.end();
    } catch (error) {
      logSafeError("phrase_seed.pool_close_failed", error);
      process.exitCode = 1;
    }
  }
}
