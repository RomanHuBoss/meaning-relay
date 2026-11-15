// Этот обработчик принимает HTTP-запрос, проверяет его безопасность и возвращает ограниченный по данным ответ.
import { NextResponse } from "next/server";
import { relayRuntime } from "../../../../../lib/relay/runtime";
import { relayErrorResponse } from "../../../../../lib/http/errors";
import { publicMessageText } from "../../../../../lib/http/public-chain";

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicCode: string }> },
) {
  try {
    const { publicCode } = await context.params;
    const state = await relayRuntime.getPublicState(publicCode);
    const chain = {
      public_code: state.publicCode,
      language: state.language,
      status: state.status,
      current_hop: state.currentHop,
      target_hops: state.targetHops,
      topic: state.themeTitle,
      completed_at: state.completedAt?.toISOString() ?? null,
      ...(state.status === "PAUSED" ? { paused: true } : {}),
    };
    if (!("seedText" in state)) return NextResponse.json({ chain });

    const seedText = state.seedText ?? "";
    const seedTokens = new Set(seedText.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    // Метрики намеренно считают исходный сохранённый текст. После решения
    // модератора HIDDEN заменяется только текст, который показывается наружу.
    const finalText = state.messages.at(-1)?.text ?? "";
    const finalTokens = new Set(finalText.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    const union = new Set([...seedTokens, ...finalTokens]);
    const intersection = [...seedTokens].filter((token) => finalTokens.has(token)).length;
    return NextResponse.json({
      chain,
      seed: { text: seedText },
      messages: state.messages.map((message) => ({
        id: message.id,
        hop_index: message.hopIndex,
        text: publicMessageText(message),
        moderation_status: message.moderationStatus,
      })),
      metrics: {
        seed_character_count: Array.from(seedText.trim()).length,
        final_character_count: Array.from(finalText.trim()).length,
        seed_unique_word_count: seedTokens.size,
        final_unique_word_count: finalTokens.size,
        token_overlap_percent: union.size === 0 ? 0 : Math.round(100 * intersection / union.size),
      },
    });
  } catch (error) {
    return relayErrorResponse(error);
  }
}
