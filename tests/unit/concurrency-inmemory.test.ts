// Этот тестовый модуль проверяет локальную модель гонки заявок и не подменяет
// им проверку конкурентных транзакций PostgreSQL.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryRelay } from "../../lib/relay/in-memory";
import { RelayError } from "../../packages/shared/types/relay";

const longText = "Это достаточно длинный пересказ, который проходит минимальные ограничения и меняет исходную формулировку.";

async function concurrent<T>(count: number, action: () => T): Promise<T[]> {
  // Передача через микрозадачи делает порядок вызовов похожим на одновременные
  // HTTP-запросы, при этом синхронный адаптер остаётся полностью детерминированным.
  return Promise.all(Array.from({ length: count }, () => Promise.resolve().then(action)));
}

describe("локальная модель конкурентных заявок", () => {
  it("создаёт одну заявку при двадцати повторных стартах с одним ключом", async () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const idempotencyKey = randomUUID();

    const starts = await concurrent(20, () => relay.start("ru", "race-session", idempotencyKey, chain.publicCode));

    expect(new Set(starts.map((result) => result.claim.id)).size).toBe(1);
    expect(starts.filter((result) => !result.replayed)).toHaveLength(1);
    expect(starts.filter((result) => result.replayed)).toHaveLength(19);
    expect(relay.getAdminChain(chain.publicCode).messages).toHaveLength(0);
  });

  it("сохраняет одно сообщение при двадцати повторных отправках с одним ключом", async () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "race-session", randomUUID(), chain.publicCode);
    const idempotencyKey = randomUUID();

    const submissions = await concurrent(20, () => relay.submit(
      started.claim.id,
      "race-session",
      started.claim.claimToken!,
      idempotencyKey,
      longText,
      "FI",
    ));

    expect(new Set(submissions.map((result) => result.message.id)).size).toBe(1);
    expect(submissions.filter((result) => !result.replayed)).toHaveLength(1);
    expect(submissions.filter((result) => result.replayed)).toHaveLength(19);
    expect(relay.getPublicState(chain.publicCode).currentHop).toBe(1);
    expect(relay.getAdminChain(chain.publicCode).messages).toHaveLength(1);
  });

  it("отвергает двадцать разных ключей после первого принятого сообщения", async () => {
    const relay = new InMemoryRelay();
    const chain = relay.seedChain("ru");
    const started = relay.start("ru", "race-session", randomUUID(), chain.publicCode);

    const attempts = await Promise.all(Array.from({ length: 20 }, (_, index) => Promise.resolve().then(() => {
      try {
        return { ok: true as const, result: relay.submit(
          started.claim.id,
          "race-session",
          started.claim.claimToken!,
          randomUUID(),
          `${longText} попытка ${index}`,
        ) };
      } catch (error) {
        return { ok: false as const, error };
      }
    })));

    expect(attempts.filter((attempt) => attempt.ok)).toHaveLength(1);
    const failures = attempts.filter((attempt): attempt is { ok: false; error: unknown } => !attempt.ok);
    expect(failures).toHaveLength(19);
    expect(failures.every(({ error }) => error instanceof RelayError && error.code === "IDEMPOTENCY_KEY_REUSED")).toBe(true);
    expect(relay.getPublicState(chain.publicCode).currentHop).toBe(1);
    expect(relay.getAdminChain(chain.publicCode).messages).toHaveLength(1);
  });
});
