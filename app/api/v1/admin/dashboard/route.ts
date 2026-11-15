// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, adminErrorResponse } from "../../../../../lib/http/admin";
import { getPool } from "../../../../../lib/db/pool";
import { relayRuntime } from "../../../../../lib/relay/runtime";
import { logSafeError } from "../../../../../lib/http/safe-log";

function internalErrorResponse(): NextResponse {
  return NextResponse.json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      request_id: randomUUID(),
      retry_after_seconds: 0,
    },
  }, { status: 500 });
}

async function moderationCounters(): Promise<{ openReports: number; errorsLast24h: number }> {
  if (!process.env.DATABASE_URL) {
    if ("adminCounters" in relayRuntime) return relayRuntime.adminCounters();
    return { openReports: 0, errorsLast24h: 0 };
  }
  const result = await getPool().query(
    "SELECT " +
    "(SELECT count(*) FROM reports WHERE status = 'OPEN')::int AS open_reports, " +
    "(SELECT count(*) FROM events WHERE event_type = 'MESSAGE_REJECTED' AND created_at >= now() - interval '24 hours')::int AS errors_last_24h",
  );
  const row = result.rows[0] as { open_reports: number | string; errors_last_24h: number | string };
  return {
    openReports: Number(row.open_reports),
    errorsLast24h: Number(row.errors_last_24h),
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession(request);
    if (!session) return adminErrorResponse("ADMIN_REQUIRED", 401, "Admin authentication is required");

    const [stats, counters] = await Promise.all([
      relayRuntime.stats(),
      moderationCounters(),
    ]);

    return NextResponse.json({
      stats: {
        active_chains: stats.activeChains,
        completed_chains: stats.completedChains,
        saved_messages: stats.savedMessages,
        total_participants: stats.totalParticipants,
        updated_at: stats.updatedAt.toISOString(),
      },
      open_reports: counters.openReports,
      errors_last_24h: counters.errorsLast24h,
    });
  } catch (error) {
    logSafeError("admin.dashboard.failed", error);
    return internalErrorResponse();
  }
}

