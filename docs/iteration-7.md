# Итерация 7 — moderation flow и эксплуатационный контур

Эта итерация закрывает пользовательский путь жалобы и ежедневное обслуживание
данных, а также доводит административную панель до редактирования seed-тем.

## Публичная модерация

На странице завершённой цепочки у каждого сообщения появилась кнопка
«Пожаловаться». Форма отправляет закрытый набор причин `spam`, `abuse`,
`personal_data`, `other`, принимает пояснение до 300 Unicode code points и
получает CSRF token перед запросом. Серверный ответ показывает состояние
отправки и не скрывает сообщение автоматически.

Публичный payload цепочки дополнен стабильным `message.id`, который нужен для
адресной жалобы и не раскрывает session hash или другие идентификаторы
участника.

## Управление темами

В `/admin` вкладка Themes теперь содержит форму создания и редактирования:

- slug;
- названия RU/EN;
- seed-тексты RU/EN;
- статус `DRAFT`, `ACTIVE` или `ARCHIVED`.

POST/PATCH проходят admin session и CSRF проверки. `ADMIN_KEY` остаётся только
в React state во время login handshake и не записывается в browser storage.

## Maintenance endpoint

`POST /api/v1/internal/maintenance` принимает только `Authorization: Bearer
CRON_SECRET`. Ошибки авторизации возвращают `401 CRON_UNAUTHORIZED`, неверный
метод — `405 METHOD_NOT_ALLOWED`, ошибка транзакции — `503
MAINTENANCE_FAILED`. Успешный ответ содержит `ran_at` и счётчики
`expired_claims`, `archived_chains`, `cancelled_claims`, `deleted_rows`.

Expiry и archival в PostgreSQL выполняются отдельными транзакциями. В каждой
сначала блокируются chains в порядке `id ASC`, затем относящиеся claims, после
чего выполняются UPDATE. Retention удаляет старые participation starts,
recoveries, admin sessions, rate-limit buckets, sessions, terminal claims,
reports, analytics events и country events; завершённые messages сохраняются.

В `vercel.json` добавлен cron `* * * * *`, а `npm run maintenance` вызывает тот
же endpoint вручную.

## Проверки

Добавлен unit coverage для cron endpoint: отсутствующий/неверный secret,
успешный ответ без пользовательских cookies и запрет не-POST методов. После
изменений проходят 28 unit tests, `npm run typecheck`, `npm run lint` без
ошибок и production build.
