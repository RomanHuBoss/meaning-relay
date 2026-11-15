# Health contract

`GET /api/v1/health` имеет три проверяемых режима:

- без `DATABASE_URL`: локальный in-memory режим возвращает `200` с
  `database: "not_configured"` и не открывает подключение;
- при доступной PostgreSQL после `SELECT 1`: возвращается ровно `200` с
  `database: "ok"`;
- при ошибке подключения: возвращается `503 HEALTH_UNAVAILABLE` с generic
  body, `request_id` и `retry_after_seconds`, без текста исходного исключения.

Первые два режима нужны для локальной разработки и production probe; настоящий
сетевой health-check с PostgreSQL выполняется только в среде с `DATABASE_URL`.
