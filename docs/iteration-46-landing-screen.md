# Итерация 46 — первый экран в коде и Figma

## Реализация

- первый экран приведён к композиции handoff 1440 × 1024;
- desktop-контейнер получил ширину 1440 и внутренние поля 90 px;
- hero-заголовок настроен под размер 82 px на desktop;
- орбитальная иллюстрация увеличена до 360 px;
- статистика и три шага сохранены как отдельные семантические блоки;
- CSS-токены продолжают использовать те же роли, что и Figma handoff.

## Figma

- файл — [Meaning Relay — Visual Direction 01](https://www.figma.com/design/1cYVHQEnFT9CmBAUU3TYFh);
- основной фрейм — `Landing / Desktop`, node ID `8:2`;
- структура проверена через metadata;
- после визуального снимка исправлены прозрачность контейнеров и нижняя
  секция, чтобы она помещалась в границы фрейма.

## Проверка

- `npm.cmd ci --no-audit --no-fund` — PASS;
- `npm.cmd run typecheck` — PASS;
- `npm.cmd run lint` — PASS;
- `npm.cmd test` — 308 тестов, PASS;
- `npm.cmd run build` — PASS;
- `npm.cmd run test:e2e` — 4 теста PASS, 1 browser-тест пропущен без
  `E2E_BROWSER=1`.

В e2e-конфигурации исправлена передача `CRON_SECRET` через переменную
окружения, чтобы запуск проходил в Windows и Unix-средах.
