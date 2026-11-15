// Этот модуль создаёт единый доступ к базе данных и удерживает настройки подключения в одном месте.
import { Pool, type PoolClient } from "pg";

declare global {
  var meaningRelayPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL relay");
  if (!globalThis.meaningRelayPool) {
    globalThis.meaningRelayPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false },
    });
  }
  return globalThis.meaningRelayPool;
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
  attempts = 3,
  retryUniqueConflict = false,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      client.release();
      return result;
    } catch (error) {
      lastError = error;
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
      const code = (error as { code?: string }).code;
      const retryable = code === "40001" || code === "40P01" || (retryUniqueConflict && code === "23505");
      if (attempt >= attempts || !retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 61)));
    }
  }
  throw lastError;
}
