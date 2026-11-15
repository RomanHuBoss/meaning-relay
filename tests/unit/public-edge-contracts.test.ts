// Этот тестовый модуль фиксирует ожидаемое поведение проверяемого контура и защищает его от незаметного регресса.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { RelayError } from "../../packages/shared/types/relay";

const fakeRuntime = vi.hoisted(() => ({
  mapStats: vi.fn(),
  stats: vi.fn(),
  start: vi.fn(),
  recover: vi.fn(),
}));

vi.mock("../../lib/relay/runtime", () => ({ relayRuntime: fakeRuntime }));

import { GET as mapGet } from "../../app/api/v1/map/route";
import { GET as statsGet } from "../../app/api/v1/stats/public/route";
import { POST as startPost } from "../../app/api/v1/participation/start/route";
import { POST as recoverPost } from "../../app/api/v1/participation/recover/route";

const csrf = "c".repeat(43);
const session = "s".repeat(43);
const startKey = "00000000-0000-4000-8000-000000000000";
const recoverKey = "11111111-1111-4111-8111-111111111111";
const publicCode = "123456789A";

function getRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

function postRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `sid=${session}; csrf=${csrf}`,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(body),
  });
}

describe("public edge contracts", () => {
  const originalMapEnabled = process.env.MAP_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MAP_ENABLED;
  });

  afterEach(() => {
    if (originalMapEnabled === undefined) delete process.env.MAP_ENABLED;
    else process.env.MAP_ENABLED = originalMapEnabled;
  });

  it("keeps the map endpoint available with an explicit disabled payload", async () => {
    process.env.MAP_ENABLED = "false";
    const response = await mapGet(getRequest("http://localhost/api/v1/map?period=24h"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ period: "24h", total_events: 0, countries: [], enabled: false });
    expect(fakeRuntime.mapStats).not.toHaveBeenCalled();
  });

  it("returns the typed public stats schema and ISO timestamp", async () => {
    fakeRuntime.stats.mockResolvedValueOnce({
      activeChains: 2,
      completedChains: 7,
      savedMessages: 84,
      totalParticipants: 31,
      updatedAt: new Date("2026-11-14T12:34:56.000Z"),
    });
    const response = await statsGet();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      active_chains: 2,
      completed_chains: 7,
      saved_messages: 84,
      total_participants: 31,
      updated_at: "2026-11-14T12:34:56.000Z",
    });
  });

  it.each([
    ["CHAIN_NOT_FOUND", 404],
    ["CHAIN_BUSY", 409],
    ["CHAIN_PAUSED", 409],
    ["CHAIN_COMPLETED", 409],
    ["NO_CHAIN_AVAILABLE", 409],
    ["NO_ACTIVE_SEED", 409],
    ["LANGUAGE_MISMATCH", 409],
    ["SESSION_ALREADY_PARTICIPATED", 409],
  ] as const)("maps invite start %s to its stable HTTP status", async (code, status) => {
    fakeRuntime.start.mockRejectedValueOnce(new RelayError(code));
    const response = await startPost(postRequest("http://localhost/api/v1/participation/start", {
      language: "ru",
      public_code: publicCode,
      idempotency_key: startKey,
    }));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("keeps recover owner and chain-state failures distinct", async () => {
    fakeRuntime.recover.mockRejectedValueOnce(new RelayError("CLAIM_OWNER_REQUIRED"));
    const owner = await recoverPost(postRequest("http://localhost/api/v1/participation/recover", {
      public_code: publicCode,
      recover_idempotency_key: recoverKey,
    }));
    expect(owner.status).toBe(403);
    expect((await owner.json()).error.code).toBe("CLAIM_OWNER_REQUIRED");

    fakeRuntime.recover.mockRejectedValueOnce(new RelayError("CHAIN_PAUSED"));
    const paused = await recoverPost(postRequest("http://localhost/api/v1/participation/recover", {
      public_code: publicCode,
      recover_idempotency_key: recoverKey,
    }));
    expect(paused.status).toBe(409);
    expect((await paused.json()).error.code).toBe("CHAIN_PAUSED");
  });
});
