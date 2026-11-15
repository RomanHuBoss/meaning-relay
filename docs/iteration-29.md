# Итерация 29 — контракты входных данных start/submit

## Цель

Закрыть локально проверяемые негативные HTTP-контракты для начала участия и
отправки сообщения, а также закрепить ISO-код страны на уровне relay-модели.
Эти проверки дополняют route-контракты cancel/recover/report из итерации 28.

## Что добавлено

- `tests/unit/input-contracts.test.ts`:
  - malformed JSON на `POST /api/v1/participation/start`;
  - неизвестные поля и некорректный `public_code` на start;
  - безопасное отображение `INVALID_IDEMPOTENCY_KEY`;
  - malformed JSON, отсутствующие обязательные поля и неизвестные поля на submit;
  - отсутствие session cookie не превращается в успешный доступ к claim и
    возвращает `CLAIM_OWNER_REQUIRED`;
  - `INVALID_COUNTRY_CODE` отображается как клиентская ошибка без внутренних
    деталей.
- `tests/unit/relay.test.ts`:
  - зарезервированные ISO-коды `AA`/`ZZ` и malformed-коды отклоняются до
    изменения claim и chain.

## Проверка

- targeted unit: **22 passed**;
- полный unit/typecheck/lint/build прогон выполняется в корневой итерации после
  объединения изменений.

## Остаточный внешний gate

Локальные проверки не заменяют запуск тех же переходов на чистой PostgreSQL и
проверку конкурентных транзакций. Browser/axe, HTTPS и production persistence
по-прежнему требуют внешней среды.
