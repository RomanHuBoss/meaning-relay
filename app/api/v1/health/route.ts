// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ status: "ok", database: "not_configured" });
  }
  try {
    const { getPool } = await import("../../../../lib/db/pool");
    await getPool().query("SELECT 1");
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json({
      error: {
        code: "HEALTH_UNAVAILABLE",
        message: "Service unavailable",
        request_id: randomUUID(),
        retry_after_seconds: 30,
      },
    }, { status: 503 });
  }
}
