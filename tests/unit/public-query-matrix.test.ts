// Этот тестовый модуль фиксирует границы публичных фильтров, пагинации карты и галереи.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { encodeGalleryCursor } from "../../lib/http/gallery-cursor";

const fakeRuntime = vi.hoisted(() => ({
  listGallery: vi.fn(),
  mapStats: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));

import { GET as galleryGet } from "../../app/api/v1/chains/route";
import { GET as mapGet } from "../../app/api/v1/map/route";

const baseTime = new Date("2026-11-14T12:00:00.000Z");

function get(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function galleryRow(index: number) {
  return {
    publicCode: `123456789${String.fromCharCode(65 + index)}`,
    language: index % 2 === 0 ? "ru" as const : "en" as const,
    themeTitle: "Тема",
    completedAt: new Date(baseTime.getTime() - index * 60_000),
    targetHops: 12,
  };
}

describe("матрица публичных фильтров и пагинации", () => {
  const previousMapEnabled = process.env.MAP_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MAP_ENABLED;
    fakeRuntime.mapStats = vi.fn();
  });

  afterEach(() => {
    if (previousMapEnabled === undefined) delete process.env.MAP_ENABLED;
    else process.env.MAP_ENABLED = previousMapEnabled;
  });

  it.each([
    ["language=de", "INVALID_LANGUAGE"],
    ["period=7d", "INVALID_PERIOD"],
    ["theme=Bad_Slug", "INVALID_THEME"],
    ["limit=0", "INVALID_FILTER"],
    ["limit=abc", "INVALID_FILTER"],
  ] as const)("отклоняет недопустимый публичный фильтр %s", async (query, code) => {
    const response = await galleryGet(get(`http://localhost/api/v1/chains?${query}`));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(code);
    expect(fakeRuntime.listGallery).not.toHaveBeenCalled();
  });

  it("передаёт фильтры в relay, ограничивает страницу двенадцатью строками и выдаёт курсор", async () => {
    fakeRuntime.listGallery.mockResolvedValueOnce(Array.from({ length: 13 }, (_, index) => galleryRow(index)));

    const response = await galleryGet(get("http://localhost/api/v1/chains?language=ru&theme=small-kindness&period=30d&limit=99"));
    const body = await response.json() as { chains: Array<Record<string, unknown>>; next_cursor: string | null };

    expect(response.status).toBe(200);
    expect(fakeRuntime.listGallery).toHaveBeenCalledWith({
      language: "ru",
      themeSlug: "small-kindness",
      period: "30d",
      cursor: null,
      limit: 13,
    });
    expect(body.chains).toHaveLength(12);
    expect(body.chains[0]).toMatchObject({ public_code: "123456789A", language: "ru", target_hops: 12 });
    expect(body.chains[0]).not.toHaveProperty("session_hash");
    expect(body.next_cursor).toEqual(expect.any(String));
  });

  it("принимает подписанный курсор и передаёт его вместе с фильтрами", async () => {
    const cursor = encodeGalleryCursor({ completedAt: baseTime, publicCode: "123456789A" });
    fakeRuntime.listGallery.mockResolvedValueOnce([]);

    const response = await galleryGet(get(`http://localhost/api/v1/chains?language=all&theme=all&period=all&cursor=${encodeURIComponent(cursor)}`));

    expect(response.status).toBe(200);
    expect(fakeRuntime.listGallery).toHaveBeenCalledWith(expect.objectContaining({
      language: undefined,
      themeSlug: undefined,
      period: "all",
      cursor: { completedAt: baseTime, publicCode: "123456789A" },
      limit: 13,
    }));
    expect((await response.json()).next_cursor).toBeNull();
  });

  it("отклоняет подделанный или повреждённый курсор до обращения к relay", async () => {
    const response = await galleryGet(get("http://localhost/api/v1/chains?cursor=not-a-signed-cursor"));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("CURSOR_INVALID");
    expect(fakeRuntime.listGallery).not.toHaveBeenCalled();
  });

  it("отклоняет подписанный, но просроченный курсор до обращения к relay", async () => {
    const cursor = encodeGalleryCursor({
      completedAt: baseTime,
      publicCode: "123456789A",
      expiresAt: new Date(baseTime.getTime() - 1),
    });

    const response = await galleryGet(get(`http://localhost/api/v1/chains?cursor=${encodeURIComponent(cursor)}`));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("CURSOR_INVALID");
    expect(fakeRuntime.listGallery).not.toHaveBeenCalled();
  });

  it.each([1, 12] as const)("принимает граничный размер страницы %i", async (limit) => {
    fakeRuntime.listGallery.mockResolvedValueOnce([]);

    const response = await galleryGet(get(`http://localhost/api/v1/chains?limit=${limit}`));

    expect(response.status).toBe(200);
    expect(fakeRuntime.listGallery).toHaveBeenCalledWith(expect.objectContaining({ limit: limit + 1 }));
  });

  it("возвращает агрегированную карту за весь период", async () => {
    fakeRuntime.mapStats.mockResolvedValueOnce({
      period: "all",
      totalEvents: 8,
      countries: [{ countryCode: "FI", count: 8 }],
      updatedAt: baseTime,
    });

    const response = await mapGet(get("http://localhost/api/v1/map?period=all"));

    expect(response.status).toBe(200);
    expect(fakeRuntime.mapStats).toHaveBeenCalledWith("all");
    expect(await response.json()).toEqual({
      period: "all",
      total_events: 8,
      countries: [{ country_code: "FI", count: 8 }],
      updated_at: baseTime.toISOString(),
    });
  });

  it("не делает карту обязательной зависимостью relay при отключённом флаге", async () => {
    process.env.MAP_ENABLED = "false";

    const response = await mapGet(get("http://localhost/api/v1/map?period=24h"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ period: "24h", total_events: 0, countries: [], enabled: false });
    expect(fakeRuntime.mapStats).not.toHaveBeenCalled();
  });

  it("возвращает 400 для неизвестного периода карты", async () => {
    const response = await mapGet(get("http://localhost/api/v1/map?period=7d"));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_PERIOD");
    expect(fakeRuntime.mapStats).not.toHaveBeenCalled();
  });
});
