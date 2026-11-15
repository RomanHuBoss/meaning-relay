// Этот тестовый модуль проверяет повторяемость локального обслуживания на
// группе цепочек и не подменяет проверку PostgreSQL или боевого планировщика.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryRelay } from "../../lib/relay/in-memory";

const longText = "Это достаточно длинный текст для детерминированной проверки обслуживания цепочек.";
const day = 24 * 60 * 60 * 1000;

function completeChain(relay: InMemoryRelay, code: string, nowLabel: string): void {
  let session = `session-${nowLabel}-0`;
  let started = relay.start("ru", session, randomUUID(), code);
  for (let hop = 1; hop <= 12; hop += 1) {
    relay.submit(started.claim.id, session, started.claim.claimToken!, randomUUID(), `${longText} ход ${hop}`, "FI");
    if (hop < 12) {
      session = `session-${nowLabel}-${hop}`;
      started = relay.start("ru", session, randomUUID(), code);
    }
  }
}

describe("детерминированная длительная проверка обслуживания", () => {
  it("архивирует двадцать старых цепочек, отменяет их заявки и стабильно повторяется", () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => now });
    const staleChains = Array.from({ length: 20 }, () => relay.seedChain("ru"));

    // Заявки создаются уже после устаревания цепочек: обслуживание должно
    // отменить действующие заявки при архивировании, а не сначала истечь им.
    now = new Date(now.getTime() + 31 * day);
    for (const chain of staleChains) {
      relay.start("ru", `maintenance-${chain.publicCode}`, randomUUID(), chain.publicCode);
    }

    const first = relay.runMaintenance();
    expect(first.counts).toMatchObject({ archivedChains: 20, cancelledClaims: 20 });
    for (const chain of staleChains) {
      expect(relay.getPublicState(chain.publicCode).status).toBe("ARCHIVED");
      expect(relay.getAdminChain(chain.publicCode).status).toBe("ARCHIVED");
    }

    // Повторный запуск не должен повторно считать уже закрытые переходы.
    const second = relay.runMaintenance();
    expect(second.counts).toEqual({ expiredClaims: 0, archivedChains: 0, cancelledClaims: 0, deletedRows: 0 });
  });

  it("сохраняет завершённую историю и удаляет только состарившиеся служебные записи", () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => now });
    const completed = relay.seedChain("ru");
    completeChain(relay, completed.publicCode, "completed");

    now = new Date(now.getTime() + 121 * day);
    const result = relay.runMaintenance();
    const state = relay.getPublicState(completed.publicCode);
    const admin = relay.getAdminChain(completed.publicCode);

    // Очистка удаляет старые заявки и записи старта, но публичная история
    // сообщений и конечное состояние завершённой цепочки остаются неизменными.
    expect(result.counts.deletedRows).toBeGreaterThanOrEqual(24);
    expect(state).toMatchObject({ status: "COMPLETED", currentHop: 12 });
    expect(admin.messages).toHaveLength(12);

    const repeated = relay.runMaintenance();
    expect(repeated.counts).toEqual({ expiredClaims: 0, archivedChains: 0, cancelledClaims: 0, deletedRows: 0 });
    expect(relay.getPublicState(completed.publicCode)).toMatchObject({ status: "COMPLETED", currentHop: 12 });
  });
});
