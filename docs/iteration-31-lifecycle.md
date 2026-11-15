# Итерация 31 — lifecycle и state contracts

## Сделано

Добавлен `tests/unit/lifecycle-state.test.ts`, который локально фиксирует:

- один активный claim на session и один сохранённый message этой session в
  конкретной chain;
- неизменность snapshot заголовка и seed-текста chain после редактирования
  исходной темы администратором;
- отсутствие seed/history в публичном состоянии `PAUSED` и `ARCHIVED` chain и
  наличие полного seed/history только после `COMPLETED`;
- различие `CLAIM_CANCELLED`, `CHAIN_PAUSED`, `CHAIN_ARCHIVED` и
  `CHAIN_COMPLETED` при recovery;
- запрет повторного invite-start после уже сохранённого сообщения этой же
  session;
- запрет report до завершения chain и закрытие открытого report при архивировании
  chain;
- сохранение moderation state `HIDDEN`, количества сообщений и country events
  после скрытия сообщения;
- anonymous HTTP report: сервер создаёт session cookie и передаёт hash session в
  relay runtime.

## Ограничения evidence

Тесты подтверждают in-memory/HTTP lifecycle contracts. Они не заменяют clean
PostgreSQL assertions для deferred FK, unique indexes, concurrent claims,
report/archive race и транзакционной атомарности. Полный browser/axe и
production HTTPS прогон остаются внешними gates.
