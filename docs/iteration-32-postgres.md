# Итерация 32 — optional PostgreSQL acceptance harness

## Назначение

Добавлен отдельный integration harness для проверки PostgreSQL-пути после
подключения чистой базы. Обычный `npm test` его не запускает: интеграционный
файл исключён базовым Vitest config, а отдельный запуск выполняется командой
`npm run test:postgres`.

По умолчанию suite пропускается. Для read-only acceptance checks требуется
явный флаг `POSTGRES_ACCEPTANCE=1` вместе с `DATABASE_URL`:

```bash
DATABASE_URL='postgresql://…' \
POSTGRES_ACCEPTANCE=1 \
npm run test:postgres
```

Read-only suite проверяет наличие таблиц, partial unique indexes, deferred
foreign keys и seeded active-chain counts в пределах per-language cap.

## Mutating acceptance checks

Проверки миграции данных, транзакций и race-сценариев требуют отдельного
явного opt-in:

```bash
DATABASE_URL='postgresql://…' \
POSTGRES_ACCEPTANCE=1 \
POSTGRES_ACCEPTANCE_MUTATE=1 \
npm run test:postgres
```

Mutating suite создаёт временную theme/chain и удаляет её после завершения.
Она проверяет:

- один active claim на session;
- 20 параллельных submit с одним ключом и ровно один сохранённый message;
- replay после commit и rejection изменённого text/country;
- deferred `participation_starts.claim_id` FK на `COMMIT` с rollback.

Запускать mutating suite следует только на выделенной acceptance-базе после
`npm run migrate` и `npm run seed`. Harness намеренно не вызывает миграцию и
seed автоматически, чтобы случайный `DATABASE_URL` не получил destructive
операции.

## Исправление в этом этапе

PostgreSQL start-path теперь применяет `ACTIVE_CHAIN_CAP` отдельно для
запрошенного языка. Ранее fallback count смотрел на все активные цепочки,
что могло блокировать русский пул из-за заполненного английского пула.

Полноценный production verification всё равно требует реальной PostgreSQL,
HTTPS, backup/restore и deployment environment; пропущенный suite без
`POSTGRES_ACCEPTANCE=1` не считается evidence.
