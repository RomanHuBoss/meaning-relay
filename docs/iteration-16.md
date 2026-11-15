# Итерация 16 — HTTP/E2E smoke-контур

Добавлен Playwright smoke-контур в `tests/e2e/relay.spec.ts` и
`playwright.config.ts`.

При стандартном `npm run test:e2e` автоматически поднимается чистый Next dev
server на `127.0.0.1:3100` с тестовым `CRON_SECRET`. API smoke проверяет:

- `/api/v1/health`;
- публичные `/`, `/chains`, `/map`, `/about`;
- CSRF → session → participation/start → claim submit;
- invite continuation через `/c/{public_code}` и start с конкретным
  `public_code` в отдельном session context;
- maintenance authorization и успешный cron response;
- отказ всех non-POST методов maintenance.

В текущем sandbox HTTP suite выполняется четырьмя passing tests. Browser UI
suite оставлен в том же spec и запускается при `E2E_BROWSER=1`; по умолчанию он
skip-ится, потому что системный Chromium в этом ограниченном окружении не
может создать process singleton socket. Это не влияет на API smoke и не
скрывает browser suite в окружении, где Chromium доступен.
