// Этот модуль реализует доменные операции цепочки и сохраняет её переходы между состояниями.
import { InMemoryRelay } from "./in-memory";
import { PostgresRelay } from "./postgres";

declare global {
  var meaningRelayRuntime: InMemoryRelay | PostgresRelay | undefined;
}

export const relayRuntime =
  globalThis.meaningRelayRuntime ??
  (globalThis.meaningRelayRuntime = process.env.DATABASE_URL
    ? new PostgresRelay()
    : new InMemoryRelay());
