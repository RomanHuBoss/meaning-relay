# Итерация 34 — privacy payload и rolling aggregates

Итерация закрывает локальные evidence для privacy-контуров, которые оставались
частичными после предыдущей сверки.

## Что проверено

- `sessions` сохраняет только производный `sid_hash`; сообщения, события и
  rate-limit buckets используют хешированные значения (`session_hash` и
  `scope_hash`). В миграции и обычном runtime нет persistent exact-IP поля.
- Public chain, gallery, public stats, map и admin serializers строят явные
  allow-list payloads. Тест передаёт в fake runtime маркеры session/IP/scope и
  подтверждает, что они не выходят в JSON. Map по-прежнему отдаёт только
  агрегированные страны/счётчики, а не message id или координаты.
- `PostgresRelay.stats()` и `InMemoryRelay.stats()` теперь имеют одинаковую
  семантику: `total_participants` считает distinct session hashes только за
  rolling 90 days; `saved_messages` остаётся lifetime moderation-visible count.
  Regression проверяет границу ровно 90 дней и исключение более старой записи.
- Source contract фиксирует map k-anonymity (`>= 5`, `OTHER`, `UNKNOWN`) и
  отсутствие raw location/IP/session identifiers в SQL.

## Ошибки и внешние границы

`CLAIM_NOT_FOUND` для cancel уже входит в HTTP terminal-state matrix и
возвращает 404 без раскрытия внутреннего состояния. Реальная clean-DB
inspection, PostgreSQL migration/query execution и production HTTPS остаются
внешними проверками.

## Локальная проверка

Таргетированный набор: `npx vitest run tests/unit/privacy-payload-contracts.test.ts`.
Полный `npm test`, typecheck, lint и production/readiness gates запускаются
родительской итерацией после объединения параллельных изменений.
