# Итерация 23 — локальный PostgreSQL readiness verifier

Добавлена команда `npm run verify:readiness`. Она без подключения к базе
проверяет миграцию, seed и `.env.example` как единый production-readiness
контракт:

- атомарную оболочку `BEGIN`/`COMMIT` миграции;
- нормативные таблицы и обязательные `NOT NULL`/`PRIMARY KEY` поля;
- уникальные constraints и partial indexes для claim/idempotency race safety;
- идемпотентный seed, RU/EN-пулы, лимит 50 активных цепочек и 4 цепочки на
  тему;
- полный набор обязательных env-переменных.

Команда печатает JSON-отчёт с именованными checks и возвращает ненулевой exit
code при наличии хотя бы одного нарушения контракта. Реальное подключение PostgreSQL по-прежнему
остаётся отдельным внешним integration gate.

В этой же readiness-итерации добавлен unit-контракт health endpoint для трёх
режимов: локальный in-memory без соединения с БД, доступная БД после `SELECT 1`
и недоступная БД с generic `503 HEALTH_UNAVAILABLE` без текста исключения.
