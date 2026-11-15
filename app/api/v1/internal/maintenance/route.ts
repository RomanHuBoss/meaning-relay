// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { timingSafeEqual, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { relayRuntime } from "../../../../../lib/relay/runtime";
import { logSafeError } from "../../../../../lib/http/safe-log";

function errorResponse(code: string, status: number, message: string): NextResponse {
  return NextResponse.json({ error: { code, message, request_id: randomUUID(), retry_after_seconds: 0 } }, { status });
}

function cronAuthorized(request: NextRequest): boolean {
  const configured = process.env.CRON_SECRET;
  const presented = request.headers.get("authorization") ?? "";
  if (!configured || !presented.startsWith("Bearer ")) return false;
  const supplied = presented.slice("Bearer ".length);
  const left = Buffer.from(supplied, "utf8");
  const right = Buffer.from(configured, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!cronAuthorized(request)) return errorResponse("CRON_UNAUTHORIZED", 401, "Cron authorization is required");
  try {
    if (!("runMaintenance" in relayRuntime)) return errorResponse("MAINTENANCE_FAILED", 503, "Maintenance is unavailable");
    const result = await relayRuntime.runMaintenance();
    return NextResponse.json({
      ran_at: result.ranAt.toISOString(),
      counts: {
        expired_claims: result.counts.expiredClaims,
        archived_chains: result.counts.archivedChains,
        cancelled_claims: result.counts.cancelledClaims,
        deleted_rows: result.counts.deletedRows,
      },
    });
  } catch (error) {
    logSafeError("maintenance.failed", error);
    return errorResponse("MAINTENANCE_FAILED", 503, "Maintenance failed");
  }
}

export function GET() {
  return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed");
}

export function PUT() {
  return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed");
}

export function PATCH() {
  return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed");
}

export function DELETE() {
  return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed");
}

export function HEAD() {
  return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed");
}

export function OPTIONS() {
  return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed");
}
