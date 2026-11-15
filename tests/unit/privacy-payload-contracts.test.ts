// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { InMemoryRelay } from "../../lib/relay/in-memory";
import { serializeChainDetail, serializeReport } from "../../lib/http/admin-routes";

const fakeRuntime = vi.hoisted(() => ({
  getPublicState: vi.fn(),
  stats: vi.fn(),
  mapStats: vi.fn(),
  listGallery: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));

import { GET as publicChainGet } from "../../app/api/v1/chains/[publicCode]/route";
import { GET as galleryGet } from "../../app/api/v1/chains/route";
import { GET as mapGet } from "../../app/api/v1/map/route";
import { GET as statsGet } from "../../app/api/v1/stats/public/route";

const root = process.cwd();
const sessionMarker = "session-hash-must-not-leak";
const ipMarker = "203.0.113.42";
const scopeMarker = "scope-hash-must-not-leak";
const day = 24 * 60 * 60 * 1000;

function containsForbiddenMarker(value: unknown): boolean {
  return JSON.stringify(value).includes(sessionMarker) || JSON.stringify(value).includes(ipMarker) || JSON.stringify(value).includes(scopeMarker);
}

describe("iteration 34 privacy and aggregate contracts", () => {
  it("stores only derived session hashes and no exact IP columns", () => {
    const migration = readFileSync(path.join(root, "migrations/001_initial.sql"), "utf8");
    const sessionSource = readFileSync(path.join(root, "lib/http/session.ts"), "utf8");
    const adminSource = readFileSync(path.join(root, "lib/http/admin.ts"), "utf8");

    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS sessions[\s\S]*?sid_hash char\(64\) NOT NULL UNIQUE/u);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS messages[\s\S]*?session_hash char\(64\) NOT NULL/u);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS events[\s\S]*?session_hash char\(64\) NULL/u);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS rate_limit_buckets[\s\S]*?scope_hash char\(64\) NOT NULL/u);
    expect(migration).not.toMatch(/\b(?:ip|ip_address|client_ip|remote_addr|remote_ip)\b\s+(?:inet|cidr|text|varchar|char)/iu);
    expect(sessionSource).toMatch(/INSERT INTO sessions \(sid_hash, expires_at, last_seen_at\)/u);
    expect(sessionSource).not.toMatch(/INSERT INTO sessions \([^)]*\bsid\b/u);
    expect(adminSource).toMatch(/return createHash\("sha256"\)\.update\(address, "utf8"\)\.digest\("hex"\)/u);
  });

  it("keeps public chain, gallery, map, stats, and admin serializers free of session/IP markers", async () => {
    fakeRuntime.getPublicState.mockResolvedValueOnce({
      publicCode: "123456789A",
      language: "ru",
      status: "COMPLETED",
      currentHop: 12,
      targetHops: 12,
      themeTitle: "Тема",
      completedAt: new Date("2026-11-14T12:00:00.000Z"),
      seedText: "Безопасный seed",
      messages: [{
        id: "message-1",
        hopIndex: 1,
        text: "Достаточно длинный текст сообщения для публичного ответа.",
        moderationStatus: "ALLOWED",
        sessionHash: sessionMarker,
        ip: ipMarker,
        scopeHash: scopeMarker,
      }],
    });
    const publicResponse = await publicChainGet(new Request("http://localhost/api/v1/chains/123456789A"), {
      params: Promise.resolve({ publicCode: "123456789A" }),
    });
    expect(containsForbiddenMarker(await publicResponse.json())).toBe(false);

    fakeRuntime.listGallery.mockResolvedValueOnce([{
      publicCode: "123456789A",
      language: "ru",
      themeTitle: "Тема",
      completedAt: new Date("2026-11-14T12:00:00.000Z"),
      targetHops: 12,
      sessionHash: sessionMarker,
      ip: ipMarker,
    }]);
    const galleryResponse = await galleryGet(new NextRequest("http://localhost/api/v1/chains?period=all"));
    expect(containsForbiddenMarker(await galleryResponse.json())).toBe(false);

    fakeRuntime.mapStats.mockResolvedValueOnce({
      period: "24h",
      totalEvents: 7,
      countries: [{ countryCode: "OTHER", count: 7, sessionHash: sessionMarker, ip: ipMarker }],
      updatedAt: new Date("2026-11-14T12:00:00.000Z"),
      sessionHash: sessionMarker,
    });
    const mapResponse = await mapGet(new NextRequest("http://localhost/api/v1/map?period=24h"));
    expect(containsForbiddenMarker(await mapResponse.json())).toBe(false);

    fakeRuntime.stats.mockResolvedValueOnce({
      activeChains: 1,
      completedChains: 2,
      savedMessages: 3,
      totalParticipants: 4,
      updatedAt: new Date("2026-11-14T12:00:00.000Z"),
      sessionHash: sessionMarker,
      ip: ipMarker,
    });
    const statsResponse = await statsGet();
    expect(containsForbiddenMarker(await statsResponse.json())).toBe(false);

    const adminDetail = serializeChainDetail({
      publicCode: "123456789A",
      language: "ru",
      themeTitle: "Тема",
      currentHop: 1,
      targetHops: 12,
      status: "ACTIVE",
      lastActivityAt: new Date("2026-11-14T12:00:00.000Z"),
      createdAt: new Date("2026-11-14T12:00:00.000Z"),
      completedAt: null,
      seed: { text: "seed" },
      messages: [{
        id: "message-1",
        hopIndex: 1,
        text: "message",
        moderationStatus: "ALLOWED",
        createdAt: new Date("2026-11-14T12:00:00.000Z"),
        sessionHash: sessionMarker,
        ip: ipMarker,
      } as never],
    });
    expect(containsForbiddenMarker(adminDetail)).toBe(false);

    const adminReport = serializeReport({
      id: "report-1",
      status: "OPEN",
      reason: "PERSONAL_DATA",
      details: null,
      createdAt: new Date("2026-11-14T12:00:00.000Z"),
      resolvedAt: null,
      message: { id: "message-1", chainPublicCode: "123456789A", hopIndex: 1, text: "message", moderationStatus: "ALLOWED", sessionHash: sessionMarker, ip: ipMarker } as never,
      chain: { publicCode: "123456789A", status: "ACTIVE" },
    });
    expect(containsForbiddenMarker(adminReport)).toBe(false);
  });

  it("uses a rolling 90-day participant window in the local adapter", () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const relay = new InMemoryRelay({ now: () => now });
    const chain = relay.seedChain("ru");
    const text = (suffix: string) => `Это достаточно длинный текст для проверки агрегата участника ${suffix}.`;

    const first = relay.start("ru", "old-session", randomUUID(), chain.publicCode);
    relay.submit(first.claim.id, "old-session", first.claim.claimToken!, randomUUID(), text("первый"));

    now = new Date(now.getTime() + 90 * day);
    const boundary = relay.start("ru", "boundary-session", randomUUID(), chain.publicCode);
    relay.submit(boundary.claim.id, "boundary-session", boundary.claim.claimToken!, randomUUID(), text("граница"));
    expect(relay.stats().totalParticipants).toBe(2);

    now = new Date(now.getTime() + day);
    const recent = relay.start("ru", "recent-session", randomUUID(), chain.publicCode);
    relay.submit(recent.claim.id, "recent-session", recent.claim.claimToken!, randomUUID(), text("свежий"));
    expect(relay.stats()).toMatchObject({ savedMessages: 3, totalParticipants: 2 });
  });

  it("keeps Postgres participant and map queries aggregated and privacy-safe", () => {
    const postgres = readFileSync(path.join(root, "lib/relay/postgres.ts"), "utf8");
    expect(postgres).toMatch(/count\(DISTINCT session_hash\)[\s\S]*created_at >= now\(\) - interval '90 days'/u);
    expect(postgres).toMatch(/event_count >= 5[\s\S]*UNION ALL SELECT 'OTHER'/u);
    expect(postgres).toMatch(/'UNKNOWN'[\s\S]*country_code IS NULL/u);
    expect(postgres).not.toMatch(/\b(?:latitude|longitude|client_ip|remote_addr|session_id)\b/iu);
  });
});
