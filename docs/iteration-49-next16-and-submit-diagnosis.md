# Итерация 49 — Next.js 16 и диагностика submit 500

## Next.js

- `next`, `eslint-config-next` и `@next/eslint-plugin-next` обновлены до
  `16.4.6`;
- `zod` обновлён до `4.6.7`;
- `vitest` обновлён до `5.1.0`;
- `sharp` обновлён до `0.35.5`;
- вложенный `minimatch` TypeScript ESLint закреплён на `11.0.1` через scoped
  override;
- `npm audit --omit=dev` и полный `npm audit` возвращают 0 уязвимостей;
- Next.js 16 автоматически добавил `.next/dev/types/**/*.ts` в `tsconfig.json`;
- ESLint-конфигурация переведена с удалённого `flatConfig` на
  `nextPlugin.configs.recommended`.

## Ошибка submit 500

Локальный in-memory flow проходит штатно. Причина 500 в окружении с
`DATABASE_URL` вероятнее всего связана с недоступной или не мигрированной
PostgreSQL. Маршрут submit сначала сохраняет сессию и проверяет rate limit,
поэтому `/` и `/api/v1/csrf` могут отдавать 200 до первой операции, требующей
базу.

Для PostgreSQL-режима выполните:

```powershell
npm.cmd run migrate
Invoke-WebRequest http://127.0.0.1:3100/api/v1/health
```

Для локального in-memory режима удалите `DATABASE_URL` из текущего PowerShell
окна и перезапустите dev-сервер:

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
npm.cmd run dev -- --hostname 127.0.0.1 --port 3100
```

## Проверка

- `npm.cmd run typecheck` — PASS;
- `npm.cmd run lint` — PASS;
- `npm.cmd test` — 308 тестов, PASS;
- `npm.cmd run build` — PASS;
- `npm.cmd run test:e2e` — 4 теста PASS, 1 browser-тест пропущен без
  `E2E_BROWSER=1`.

Node.js engine расширен до `>=22 <25`. Node 22 остаётся базовой версией в
`.nvmrc` и Dockerfile, Node 24 проверен локальным typecheck, lint, test и build.
