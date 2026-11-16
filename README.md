# Meaning Relay

«Смысловой телефон» — публичный веб-эксперимент, в котором двенадцать участников
последовательно пересказывают одну мысль.

## Состояние разработки

Текущий срез содержит:

- канонические типы и константы MVP;
- детерминированную валидацию пользовательского текста;
- доменную модель relay с in-memory адаптером для локальной проверки инвариантов;
- PostgreSQL-миграцию с основными таблицами и частичными уникальными индексами;
- PostgreSQL-адаптер relay с транзакционными lock/retry-путями;
- Next.js-приложение с пользовательским relay flow и persistence draft/claim;
- HTTP-контракт для session, CSRF, participation/start, server captcha, claim submit/cancel и
  публичного состояния цепочки;
- health endpoint, maintenance job и локальный HTTP smoke-сценарий;
- публичные страницы галереи, карты и правил;
- закрытую панель `/admin` с управлением темами, цепочками и жалобами.

In-memory реализация используется только как локальный и тестовый адаптер. При
наличии `DATABASE_URL` runtime автоматически выбирает PostgreSQL-репозиторий;
без него приложение явно работает в локальном in-memory режиме.

## Требования

- Node.js 22 LTS или Node.js 24 LTS;
- PostgreSQL 16 (для production и integration-прогонов);
- npm 11 или pnpm.

## Запуск

    npm install
    npm run typecheck
    npm test
    npm run test:postgres
    npm run test:e2e
    npm run verify:readiness
    npm run verify:production
    npm run verify:documentation
    npm run audit:responsive
    npm run dev

Для PostgreSQL-режима скопируйте `.env.example` в локальный env-файл и задайте
`DATABASE_URL`, `CLAIM_TOKEN_ENCRYPTION_KEY`, `SID_PEPPER`, `ADMIN_KEY` и
`CRON_SECRET`. Без `DATABASE_URL` локальный dev/smoke использует in-memory
адаптер, не требуя внешней базы.

Исходный код сопровождается русскоязычными пояснениями к нетривиальным
решениям. Их наличие и отсутствие англоязычных пояснительных комментариев
проверяет `tests/unit/russian-comments-contract.test.ts` в составе `npm test`.

## Локальный HTTP-срез

После запуска npm run dev доступны:

- GET /api/health;
- GET /api/v1/csrf;
- POST /api/v1/session;
- POST /api/v1/participation/start;
- GET /api/v1/captcha?claim_id={claim_id}&locale={locale};
- POST /api/v1/claims/{claim_id}/submit;
- POST /api/v1/claims/{claim_id}/cancel;
- GET /api/v1/chains/{public_code}.
- GET /chains/{public_code} и GET /c/{public_code} для публичной цепочки и invite flow.

Мутирующие запросы требуют заголовок x-csrf-token и cookie, полученные через
CSRF/session endpoints. Перед submit интерфейс получает короткую подписанную
арифметическую проверку через captcha endpoint, а ответ проверяется сервером.
До подключения PostgreSQL состояние relay хранится только в памяти процесса
разработки.

## PostgreSQL режим

Если задан DATABASE_URL, runtime автоматически использует PostgresRelay. Для
этого также требуется CLAIM_TOKEN_ENCRYPTION_KEY — base64-значение длиной 32
байта. Без DATABASE_URL используется временный in-memory адаптер для локальных
unit и HTTP smoke-проверок.

Перед первым запуском PostgreSQL выполните `npm run migrate`: команда применяет
`migrations/001_initial.sql` через параметризованное подключение из
`DATABASE_URL`.
Для чистой базы можно выполнить `npm run seed`: скрипт идемпотентно создаёт 5
активных тем и доводит пул до 20 активных цепочек на каждый язык, по 4 на тему.
Сейчас доступны русский, английский, китайский, французский, хинди и испанский.

Для расширения пула стартовых мыслей используйте `npm run generate:phrases` и
затем `npm run seed:phrases`. По умолчанию создаются 3000 русско-английских
пар с короткими неоднозначными вступлениями, которые оставляют место для
продолжения. Количество можно передать первым аргументом генератора.

Для повторяемой проверки мобильной адаптивности запустите dev-сервер и выполните
`npm run audit:responsive`. Команда снимает публичные экраны и экран хода на
ширинах 320, 375, 390 и 412 CSS-пикселей, проверяет горизонтальный overflow,
выход интерактивных элементов за viewport и ошибки браузера. Снимки и метрики
сохраняются в `artifacts/mobile-audit`.

Перед production deployment запустите `npm run verify:readiness` и
`npm run verify:production` в окружении хостинга. Readiness verifier проверяет
миграцию, seed и env-документацию без подключения к базе; production preflight
дополнительно требует реальный `DATABASE_URL`, TLS, 32-байтовый ключ
`CLAIM_TOKEN_ENCRYPTION_KEY`, непустые secrets, HTTPS `PUBLIC_BASE_URL` и
рабочий Vercel Cron для maintenance. В development режиме preflight сохраняет
локальный in-memory fallback.

Перед публикацией также запустите `npm run verify:documentation`. Эта команда
сверяет README, `package.json` и `.env.example`: эксплуатационные команды,
служебные endpoint’ы и обязательные переменные окружения должны оставаться
описанными одновременно с исходным кодом. Проверка не подключается к базе и не
заменяет `verify:readiness` или `verify:production`.

## Развёртывание на VPS

В репозитории есть production-контур для Docker Compose. Он поднимает
PostgreSQL 16, приложение Next.js в standalone-режиме и отдельный контейнер,
который вызывает maintenance endpoint раз в минуту.

1. Установите Docker Engine с Compose v2 и создайте `.env` на основе
   `.env.example`.
2. Для VPS задайте `POSTGRES_PASSWORD`, `SID_PEPPER`, `ADMIN_KEY`,
   `CRON_SECRET`, 32-байтовый base64 `CLAIM_TOKEN_ENCRYPTION_KEY`,
   внешний HTTPS `PUBLIC_BASE_URL` и контактные адреса.
3. Запустите `docker compose -f docker-compose.vps.yml up -d --build`.
4. Проверьте `GET /api/health`, затем настройте TLS reverse proxy перед портом
   приложения. База данных остаётся во внутренней сети Compose и хранится в
   volume `meaning-relay-db`.

Compose повторно применяет идемпотентную миграцию, базовый seed и пул стартовых
фраз при старте приложения.
Перед обновлением VPS сохраните резервную копию volume PostgreSQL.

В текущем HTTP-срезе также доступен POST /api/v1/participation/recover. Он
ротирует токен активного claim, помечает предыдущие recovery-операции stale и
возвращает тот же токен при idempotent replay. Rate limits START=20, SUBMIT=10 и
RECOVER=5 считаются по фиксированным UTC-бакетам в 10 минут. Для moderation
действует лимит REPORT=5 в час, а для административного входа
ADMIN_LOGIN=5 в 15 минут.

Публичный moderation endpoint: POST /api/v1/messages/{message_id}/reports.
Публичные агрегаты доступны через GET /api/v1/stats/public, а состояние базы
можно проверить через GET /api/v1/health. Серверный административный контур
доступен через POST /api/v1/admin/login, POST /api/v1/admin/logout и
GET /api/v1/admin/dashboard; он использует `ADMIN_KEY` и не раскрывает секрет
браузерному JavaScript. Доступны также защищённые admin routes для themes,
chains и reports с pause/resume/archive и moderation mutations. Главная страница уже содержит пользовательский flow от
выбора языка до отправки хода и просмотра результата.

Агрегированная карта доступна через GET /api/v1/map?period=24h или
`period=all`. В ответе нет координат, IP, session hash и message id: известные
страны с количеством событий меньше пяти объединяются в `OTHER`, а отправки без
страны — в `UNKNOWN`.

Галерея завершённых цепочек доступна через GET /api/v1/chains с фильтрами
языка, темы, периода и подписанной пагинацией по cursor.

Закрытая панель `/admin` использует `ADMIN_KEY` только для server-side login
handshake и предоставляет обзор, создание/редактирование тем, списки цепочек и
moderation actions без сохранения секрета в браузерном storage.

HTTP smoke-контур запускается через `npm run test:e2e`: он сам поднимает чистый
Next dev server, проверяет health/CSRF/session/start/submit, invite continuation
и maintenance auth. Browser UI checks можно включить через `E2E_BROWSER=1` в
окружении с доступным Chromium.

После непоследнего хода участник может скопировать invite URL
`/c/{public_code}?join=1&language=ru|en|zh|fr|hi|es`. Получатель подтверждает продолжение
в root flow, после чего start-запрос направляется в указанную chain, а не в
случайный пул.

Эксплуатационный job доступен через `POST /api/v1/internal/maintenance` с
`Authorization: Bearer CRON_SECRET`. В `vercel.json` настроен запуск каждую
минуту; тот же endpoint можно вызвать вручную через `npm run maintenance`.
Команда принимает `MAINTENANCE_TIMEOUT_MS` (по умолчанию 15000) и завершается
с ненулевым кодом при сетевой ошибке или превышении таймаута.
Job истекает claims, архивирует неактивные chains, закрывает связанные
жалобы и выполняет retention cleanup. Пользовательские cookies для него не
требуются и не устанавливаются.
