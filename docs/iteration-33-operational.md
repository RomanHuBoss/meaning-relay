# Итерация 33 — operational source contracts

## Сделано

- Добавлены source-level проверки maintenance CLI и PostgreSQL maintenance:
  bounded timeout, безопасный operational marker, parent-chain → claim lock
  order и retention cleanup для recovery/rate-limit/country-event rows.
- Зафиксирован точный Vercel Cron path и cadence.
- Добавлены production security headers:
  `Strict-Transport-Security` и `Content-Security-Policy`; существующие
  `nosniff`, frame, referrer и permissions headers сохранены.

## Ограничения evidence

Source-level проверки не заменяют реальный PostgreSQL retention/deadlock run,
HTTPS probe, Vercel deployment confirmation, alert delivery и backup/restore.
