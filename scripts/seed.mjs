// Этот служебный сценарий выполняет проверяемую операцию обслуживания и возвращает явный результат для запуска и журналов.
/* global process, console */

import pg from "pg";
import { randomBytes } from "node:crypto";
import { logSafeError } from "./safe-error.mjs";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exitCode = 1;
} else {
  const themes = [
    {
      slug: "small-kindness",
      titleRu: "Маленькая доброта",
      titleEn: "Small Kindness",
      seedRu: "Небольшая доброта иногда меняет весь день другого человека.",
      seedEn: "A small kindness can sometimes change another person's entire day.",
    },
    {
      slug: "shared-horizon",
      titleRu: "Общий горизонт",
      titleEn: "Shared Horizon",
      seedRu: "Когда мы смотрим в одну сторону, расстояние между нами становится короче.",
      seedEn: "When we look in the same direction, the distance between us becomes shorter.",
    },
    {
      slug: "patient-work",
      titleRu: "Терпеливая работа",
      titleEn: "Patient Work",
      seedRu: "Большое изменение складывается из тихих повторяющихся действий.",
      seedEn: "A lasting change is built from quiet actions repeated over time.",
    },
    {
      slug: "unexpected-question",
      titleRu: "Неожиданный вопрос",
      titleEn: "Unexpected Question",
      seedRu: "Хороший вопрос иногда открывает дверь, которую мы не замечали.",
      seedEn: "A good question can open a door we did not know was there.",
    },
    {
      slug: "room-to-listen",
      titleRu: "Место для слушания",
      titleEn: "Room to Listen",
      seedRu: "Внимательное слушание оставляет человеку место сказать больше.",
      seedEn: "Careful listening gives another person room to say more.",
    },
  ];
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  function publicCode() {
    return Array.from(randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join("");
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const themeIds = [];
    for (const theme of themes) {
      const result = await client.query(
        "INSERT INTO themes (slug, title_ru, title_en, seed_text_ru, seed_text_en, status) " +
        "VALUES ($1, $2, $3, $4, $5, 'ACTIVE') " +
        "ON CONFLICT (slug) DO UPDATE SET title_ru = EXCLUDED.title_ru, title_en = EXCLUDED.title_en, " +
        "seed_text_ru = EXCLUDED.seed_text_ru, seed_text_en = EXCLUDED.seed_text_en, status = 'ACTIVE', updated_at = now() " +
        "RETURNING id",
        [theme.slug, theme.titleRu, theme.titleEn, theme.seedRu, theme.seedEn],
      );
      themeIds.push({ ...theme, id: result.rows[0].id });
    }

    for (const language of ["ru", "en", "zh", "fr", "hi", "es"]) {
      const total = await client.query("SELECT count(*)::int AS count FROM chains WHERE language = $1 AND status = 'ACTIVE'", [language]);
      if (Number(total.rows[0].count) > 50) throw new Error(`Active chain cap is already exceeded for ${language}`);
      const additions = [];
      for (const theme of themeIds) {
        const existing = await client.query("SELECT count(*)::int AS count FROM chains WHERE theme_id = $1 AND language = $2 AND status = 'ACTIVE'", [theme.id, language]);
        const missing = Math.max(0, 4 - Number(existing.rows[0].count));
        for (let index = 0; index < missing; index += 1) additions.push(theme);
      }
      if (Number(total.rows[0].count) + additions.length > 50) throw new Error(`Seeding ${language} would exceed the active chain cap`);
      for (const theme of additions) {
        let code = publicCode();
        let available = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const collision = await client.query("SELECT 1 FROM chains WHERE public_code = $1", [code]);
          if (!collision.rowCount) {
            available = true;
            break;
          }
          code = publicCode();
        }
        if (!available) throw new Error("Unable to allocate a unique public code");
        // Для новых языков цепочка уже доступна сразу. Пока отдельные
        // переводы тем не заведены, используем английский исходный текст.
        const title = language === "ru" ? theme.titleRu : theme.titleEn;
        const seed = language === "ru" ? theme.seedRu : theme.seedEn;
        await client.query(
          "INSERT INTO chains (public_code, theme_id, theme_title_snapshot, seed_text_snapshot, language, target_hops) " +
          "VALUES ($1, $2, $3, $4, $5, 12)",
          [code, theme.id, title, seed, language],
        );
      }
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ seeded_themes: themes.length, languages: ["ru", "en", "zh", "fr", "hi", "es"], chains_per_language: 20 }));
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logSafeError("seed.rollback_failed", rollbackError);
      }
    }
    logSafeError("seed.failed", error);
    process.exitCode = 1;
  } finally {
    client?.release();
    try {
      await pool.end();
    } catch (closeError) {
      logSafeError("seed.pool_close_failed", closeError);
      process.exitCode = 1;
    }
  }
}
