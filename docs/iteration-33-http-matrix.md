# Итерация 33 — HTTP state matrix

## Сделано

Добавлен `tests/unit/http-state-matrix.test.ts`.

- `cancel` маппит `CLAIM_CANCELLED`, `CLAIM_EXPIRED` и `CLAIM_NOT_FOUND` в
  стабильные HTTP-статусы.
- `submit` отдельно проверен для `CHAIN_PAUSED`, `CHAIN_COMPLETED`,
  `CHAIN_ARCHIVED`, `CLAIM_EXPIRED` и `CLAIM_CANCELLED`.
- `recover` отдельно проверен для cancelled, paused, completed, archived и
  expired состояний.
- malformed `public_code` и invalid recovery idempotency key проверяются до
  успешного вызова runtime.
- public chain route отдаёт moderation placeholder для скрытого текста, не
  раскрывая исходный HTML-подобный payload, но сохраняет метрики исходного
  текста.
- report route возвращает стабильный `{ report: { id, status: "OPEN" } }`.

## Ограничения evidence

Матрица проверяет route mapping и JSON serialization на mock runtime. Она не
заменяет PostgreSQL transaction/race tests и browser/axe/XSS audit.
