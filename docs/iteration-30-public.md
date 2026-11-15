# Итерация 30 — public/API edge contracts

## Сделано

- Добавлен `tests/unit/public-edge-contracts.test.ts`:
  - явный `MAP_ENABLED=false` fallback с пустой безопасной картой;
  - точная схема `/api/v1/stats/public` и ISO timestamp;
  - стабильные HTTP-коды invite start для `CHAIN_NOT_FOUND`, `CHAIN_BUSY`,
    `CHAIN_PAUSED`, `CHAIN_COMPLETED`, `NO_CHAIN_AVAILABLE`, `NO_ACTIVE_SEED`,
    `LANGUAGE_MISMATCH` и `SESSION_ALREADY_PARTICIPATED`;
  - различение `CLAIM_OWNER_REQUIRED` и состояния chain на recover.
- В relay unit tests добавлены:
  - same-key submit с изменённым text/country;
  - start idempotency reuse, TTL и cancelled replay;
  - приоритет статуса chain над языком при invite start;
  - recover без claim текущей session;
  - приоритет `NO_CHAIN_AVAILABLE` на cap перед `NO_ACTIVE_SEED`;
  - запрет 13-го хода после `COMPLETED`.
- In-memory selection приведён к PostgreSQL-контракту: при отсутствии кандидатов
  cap языка проверяется раньше доступности active seed.

## Остаточные ограничения

Тесты не заменяют чистую PostgreSQL-проверку deferred FK, concurrent submit,
advisory-lock и race-сценариев; browser/HTTPS/backup остаются внешними gates.
