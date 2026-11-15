# Итерация 26 — production preflight и безопасный database CLI

`npm run migrate` и `npm run seed` перехватывают ошибки уже на этапе
`pool.connect()`. При недоступной базе CLI завершается с кодом 1 и пишет только
нормализованный operational marker; hostname, SQL-диагностика и сетевой stack
trace не попадают в stderr. Это покрыто smoke-тестами, которые запускают оба
реальных `.mjs`-скрипта против недоступного локального порта.

Добавлена команда `npm run verify:production`. Она проверяет без подключения к
внешним ресурсам, что production-конфигурация не запускается с placeholder
секретами, отключённым TLS, HTTP/localhost `PUBLIC_BASE_URL` или сломанным
Vercel Cron для maintenance.

В production-режиме обязательны `DATABASE_URL`, 32 decoded bytes для
`CLAIM_TOKEN_ENCRYPTION_KEY`, непустые секреты достаточной длины,
`DATABASE_SSL` не равный `disable`, HTTPS URL и privacy/moderation contacts.
При `NODE_ENV=development` локальный in-memory fallback сохраняется и preflight
не требует production secrets.
