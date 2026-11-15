# Итерация 32 — report и rate-limit route contracts

## Сделано

Добавлен `tests/unit/report-rate-contracts.test.ts`:

- report body должен быть JSON-объектом без неизвестных полей;
- malformed/invalid body отклоняется до обращения к rate limiter и relay;
- anonymous report получает `sid` cookie после разрешённого запроса;
- исчерпанный `REPORT` bucket возвращает `429`, `Retry-After` и
  `RATE_LIMITED`, не создавая report; новый anonymous client при этом получает
  `sid` cookie, чтобы повторными запросами без cookie нельзя было обойти bucket;
- `REPORT_NOT_ALLOWED`, `CHAIN_ARCHIVED` и `MESSAGE_NOT_FOUND` сохраняют
  стабильные HTTP-коды `409`, `410` и `404`;
- разрешённая причина `personal_data` передаётся в relay как `PERSONAL_DATA`.

## Проверка

- targeted route tests: **6 passed**.

Тесты проверяют route-level mapping и не подменяют PostgreSQL-бакет. Реальная
межинстансовая rate-limit атомарность и report/archive race остаются внешними
PostgreSQL gates.
