// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeGalleryCursor, encodeGalleryCursor } from "../../lib/http/gallery-cursor";
import { InMemoryRelay } from "../../lib/relay/in-memory";
import { RelayError } from "../../packages/shared/types/relay";

const longText = "Это достаточно длинный текст для завершения цепочки и проверки публичной галереи.";

function complete(relay: InMemoryRelay, code: string, prefix: string): void {
  for (let hop = 1; hop <= 12; hop += 1) {
    const session = `${prefix}-${hop}`;
    const started = relay.start("ru", session, randomUUID(), code);
    relay.submit(started.claim.id, session, started.claim.claimToken!, randomUUID(), `${longText} ${prefix} ${hop}`);
  }
}

describe("completed chain gallery", () => {
  it("sorts completed chains and resumes from a signed tuple cursor", () => {
    let now = new Date("2026-11-14T12:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => now });
    const first = relay.seedChain("ru");
    complete(relay, first.publicCode, "first");
    now = new Date("2026-11-14T12:01:00.000Z");
    const second = relay.seedChain("ru");
    complete(relay, second.publicCode, "second");

    const all = relay.listGallery({ language: "ru", period: "all", limit: 13 });
    expect(all).toHaveLength(2);
    expect(all[0].publicCode).toBe(second.publicCode);
    const encoded = encodeGalleryCursor({ completedAt: all[0].completedAt, publicCode: all[0].publicCode });
    const decoded = decodeGalleryCursor(encoded);
    expect(decoded?.publicCode).toBe(second.publicCode);
    const rest = relay.listGallery({ language: "ru", period: "all", cursor: decoded, limit: 13 });
    expect(rest.map((chain) => chain.publicCode)).toEqual([first.publicCode]);
  });

  it("rejects an unknown theme filter", () => {
    const relay = new InMemoryRelay();
    expect(() => relay.listGallery({ themeSlug: "missing-theme" })).toThrowError(new RelayError("THEME_NOT_FOUND"));
  });
});
