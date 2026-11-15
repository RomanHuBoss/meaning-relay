# Итерация 30 — admin HTTP contracts

## Цель

Закрепить локально проверяемые контракты административного HTTP-контура после
негативных public start/submit/cancel/recover/report проверок.

## Что добавлено

- `tests/unit/admin-route-contracts.test.ts`:
  - обычная session без `admin_sid` получает `ADMIN_REQUIRED` до вызова runtime;
  - read-only admin routes проверяют статус, язык, limit и подписанный opaque
    cursor;
  - mutation routes требуют CSRF и пустое тело;
  - dismiss/hide-message/archive-chain сериализуют `resolved_at`;
  - повторная модерация маппится в `REPORT_ALREADY_RESOLVED`;
  - theme PATCH отклоняет неизвестные поля/некорректный статус и безопасно
    маппит `THEME_NOT_FOUND` в 404.

## Проверка

- targeted unit: **7 passed**;
- проверка не требует PostgreSQL и не подменяет production persistence.

## Остаточные внешние gates

Остаются PostgreSQL race/transaction проверки, реальный admin HTTPS/HttpOnly
контур и browser accessibility/visual audit.
