# Итерация 28 — negative HTTP and terminal-state contracts

Добавлены локальные route-level проверки для cancel/recover/report:

- invalid CSRF и обязательная session;
- malformed JSON и unknown fields;
- `CLAIM_CANCELLED` и `CLAIM_SUBMITTED` как отдельные HTTP-конфликты;
- duplicate report;
- `RATE_LIMITED` с корректным `Retry-After`;
- успешный cancel с `204`.

В relay unit coverage добавлены terminal transitions: cancelled claim нельзя
submit/recover, а submitted claim нельзя cancel/recover. Это снижает локальные
gaps в AT-F-006a, AT-F-024 и AT-F-025; PostgreSQL race/integration остаётся
внешним gate.
