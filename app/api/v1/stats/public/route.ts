// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextResponse } from "next/server";
import { relayRuntime } from "../../../../../lib/relay/runtime";
import { relayErrorResponse } from "../../../../../lib/http/errors";

export async function GET() {
  try {
    const stats = await relayRuntime.stats();
    return NextResponse.json({
      active_chains: stats.activeChains,
      completed_chains: stats.completedChains,
      saved_messages: stats.savedMessages,
      total_participants: stats.totalParticipants,
      updated_at: stats.updatedAt.toISOString(),
    });
  } catch (error) {
    return relayErrorResponse(error);
  }
}
