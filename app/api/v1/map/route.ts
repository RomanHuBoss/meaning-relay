// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextRequest, NextResponse } from "next/server";
import { relayErrorResponse, requestErrorResponse } from "../../../../lib/http/errors";
import { relayRuntime } from "../../../../lib/relay/runtime";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") ?? "24h";
  if (period !== "24h" && period !== "all") {
    return requestErrorResponse("INVALID_PERIOD", 400, "period must be 24h or all");
  }
  if (process.env.MAP_ENABLED === "false") {
    return NextResponse.json({ period, total_events: 0, countries: [], updated_at: new Date().toISOString(), enabled: false });
  }
  try {
    if (!("mapStats" in relayRuntime)) {
      return requestErrorResponse("INTERNAL_ERROR", 503, "Map storage is unavailable");
    }
    const result = await relayRuntime.mapStats(period);
    return NextResponse.json({
      period: result.period,
      total_events: result.totalEvents,
      countries: result.countries.map((country) => ({ country_code: country.countryCode, count: country.count })),
      updated_at: result.updatedAt.toISOString(),
    });
  } catch (error) {
    return relayErrorResponse(error);
  }
}
