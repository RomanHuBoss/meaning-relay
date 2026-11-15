# Acceptance ledger

Последняя локальная сверка: 2026-11-14. Ledger фиксирует только наблюдаемое
локальное evidence и отдельно помечает проверки, для которых нужны настоящие
PostgreSQL, HTTPS, backup storage, браузер или ручной прогон.

## Статусы

| Статус | Значение |
| --- | --- |
| `PASS-L` | критерий непосредственно проверен локальным unit/HTTP smoke; это не заменяет production-проверку, если она предусмотрена критерием |
| `PARTIAL-L` | проверена только локальная модель, mock, статический контракт или часть сценария |
| `BLOCKED-E` | проверка требует внешнего ресурса, которого нет в текущей среде |
| `NC` | отдельного evidence в текущем срезе нет |

Команды, на которых основан ledger: `npm test` (**306 passed**, 50 test files), `npm run
verify:readiness` и `npm run verify:production` (локальные checks passed), `npm
run typecheck`, `npm run lint`, `npm run verify:documentation`, `npm run
test:postgres` (**6 skipped без DATABASE_URL**), `CI=1 npm run test:e2e` (**4
passed, 1 skipped**) и clean `NEXT_PRIVATE_BUILD_WORKER=1 npm run build`.

## Итерация 39 — тела HTTP-запросов, ошибки и доступность

- `tests/unit/http-body-matrix.test.ts` добавляет 26 тестов для `start`,
  `submit`, `recover` и `report`: повреждённый JSON, `null`, массивы,
  отсутствующие и лишние поля, неверные типы, публичный код, язык, ключи
  повторения, причины и подробности жалоб. Невалидное тело отклоняется до
  ограничения частоты и до обращения к relay.
- `tests/unit/error-envelope-contracts.test.ts` фиксирует единый конверт
  `code/message/request_id/retry_after_seconds` и безопасный ответ `503` для
  недоступного хранилища. Публичные и административные маршруты больше не
  используют старый ответ без идентификатора обращения.
- `tests/unit/a11y-iteration39-source.test.ts` проверяет скрытие декоративных
  слоёв карты, явные связи `label`/`id` в жалобе и локальные коэффициенты
  контраста. Изменения интерфейса не выдаются за браузерный axe-аудит.
- Граничные размеры страниц и срок действия подписанного курсора галереи
  дополнительно закреплены в `public-query-matrix.test.ts`.

Эти проверки остаются локальными unit/source-контрактами. Они не заменяют
настоящий браузерный прогон, HTTPS, PostgreSQL и внешнюю наблюдаемость.

## Итерация 40 — административные запросы, терминальные состояния и эксплуатация

- `tests/unit/admin-query-matrix.test.ts` добавляет 10 тестов для фильтров
  тем, языка, состояния цепочек и жалоб, границ `limit`, подписанной пагинации,
  повреждённого курсора, allow-list сериализации и безопасного `503`.
- `tests/unit/terminal-http-matrix.test.ts` добавляет 11 тестов для отмены и
  восстановления: неизвестная заявка, неверная сессия, истёкшее,
  отменённое, отправленное и завершённое состояние, а также порядок отказа до
  ограничения частоты и relay.
- `tests/unit/maintenance-route.test.ts` расширен проверками схемы авторизации
  Cron, безопасного `503` при исключении хранилища и всех шести запрещённых
  HTTP-методов.
- `tests/unit/production-preflight.test.ts` дополнен отрицательными проверками
  тайм-аута обслуживания и небезопасных production URL.
- Исправлен `ensureSession`: повреждённая `sid` теперь считается новой
  сессией, и браузер получает замену cookie. Регрессия закреплена в
  `session-csrf-contracts.test.ts`.

Локальные проверки этой итерации не закрывают чистую PostgreSQL, production
HTTPS, реальный Cron, backup/restore или браузерный аудит.

## Итерация 41 — визуальные состояния, адаптивность и восстановление хода

- В `components/relay-app.tsx` восстановленный ход снова использует мягкий
  таймер 45 секунд, а не весь серверный срок жизни заявки. После истечения
  мягкого таймера корректный текст всё ещё можно отправить; это закреплено
  тремя source-контрактами в `ux-states-iteration41-source.test.ts`.
- Узкая вёрстка получила явные контракты для переноса шапки, действий панели
  и длинного слова в заголовке. Длинные заголовки панелей теперь переносятся
  внутри карточки через `overflow-wrap: anywhere`; регрессия найдена при
  ручном просмотре в Chromium и закреплена тестом.
- Административная панель получила русскую подпись контура, явные связи
  `label`/`id`, `aria-busy`, живые области загрузки и успеха, а также понятные
  пустые состояния тем и цепочек.
- Реальный локальный Chromium вручную отобразил `/`, `/chains`, `/map`,
  `/about` и `/admin` на работающем приложении. Это подтверждает доступность
  основных экранов для просмотра, но не заменяет автоматический браузерный
  аудит: headless Chromium в текущем sandbox завершается с
  `socket() failed: Operation not permitted`.

После этой итерации локальная unit-матрица содержит 303 теста в 49 файлах.
Реальная PostgreSQL, HTTPS, внешняя наблюдаемость, производительность и
автоматический браузерный аудит по-прежнему требуют внешней среды.

## Итерация 42 — звёздно-галактический фон

- В корневой разметке появился отдельный декоративный слой `.galaxy-backdrop`
  с редкими звёздами, туманностью и мягким ореолом. Он помечен
  `aria-hidden="true"`, не перехватывает ввод и находится ниже содержимого.
- Фон сохраняет существующую тёмную тему и лаймовый акцент, добавляя холодные
  бирюзовые, синие и фиолетовые свечения. Карточки и поля остаются
  полупрозрачными, чтобы текст не терял контраст.
- Движение слоя медленное и отключается при `prefers-reduced-motion: reduce`;
  на узких экранах интенсивность свечения уменьшается. Контракт закреплён в
  `tests/unit/galaxy-background-source.test.ts` (3 теста).
- Нативный Chromium вручную отобразил обновлённые `/`, `/chains`, `/map`,
  `/about`, `/admin` и экран выбора языка; проверенные кадры сохранены в
  `meaning-relay-screenshots/iteration-42-*.jpg`.

Автоматический headless visual regression по-прежнему не считается пройденным:
в текущем sandbox Chromium завершается с `socket() failed: Operation not
permitted`. Ручные кадры подтверждают визуальное состояние экранов, но не
заменяют полноценный axe-аудит и проверку всех размеров окна.

## Итерация 43 — глубина космической композиции

- Главная сцена получила стеклянный центр созвездия, крупную орбитальную дугу,
  световые карточки статистики и более выразительное разделение переднего и
  заднего плана.
- Единый материал поверхностей теперь используется на галерее, карте,
  правилах, административных блоках и экранах цепочки. Состояния наведения
  усиливают иерархию, а при `prefers-reduced-motion: reduce` подъём карточек
  отключается.
- Нативный Chromium вручную проверил шесть экранов; чистый комплект кадров
  сохранён в `screenshots-meaning-relay-iteration-43-final.zip`.

Эта визуальная проверка остаётся ручным evidence: автоматический headless
скриншотный прогон в текущем sandbox блокируется системным ограничением
`socket()/ptrace`.

## Итерация 38 — публичные запросы, обслуживание и сериализация

- `tests/unit/public-query-matrix.test.ts` проверяет фильтры языка, темы,
  периода и лимита, ограничение страницы, подписанный cursor, повреждённый
  cursor, карту за весь период и работу при `MAP_ENABLED=false`.
- `tests/unit/maintenance-soak.test.ts` проверяет двадцать устаревших цепочек,
  отмену заявок, повторяемость maintenance и сохранение завершённой истории.
- `tests/unit/public-xss-contracts.test.ts` запрещает опасную HTML-разметку и
  динамическое выполнение, проверяет ALLOWED/HIDDEN-сериализацию и список
  разрешённых полей административного сериализатора.

Проверки используют локальный адаптер и статический анализ. Они не заменяют
браузерный XSS/axe-аудит, production performance или PostgreSQL maintenance.

## Итерация 37 — HTTP и PostgreSQL acceptance matrix

- `tests/unit/http-lifecycle-matrix.test.ts` проверяет приоритет CSRF и
  `SESSION_REQUIRED`, ограничение частоты запросов до обращения к relay,
  сохранение анонимной cookie и безопасное отображение ошибок start/submit/
  recover/report.
- `tests/unit/route-inventory.test.ts` добавляет прямые контракты для корневого
  и API health, dashboard, logout и административной цепочки.
- `tests/integration/postgres-gates.integration.test.ts` теперь содержит
  отдельные изменяющие цепочки для завершения на двенадцатом ходу, запрета
  тринадцатого claim и archive/report transition с `resolved_at`.

Изменяющая PostgreSQL-группа запускается только с явным
`POSTGRES_ACCEPTANCE_MUTATE=1`, а без базы остаётся пропущенной. Локальные HTTP
и in-memory проверки не заменяют настоящие конкурентные транзакции.

## Итерация 36 — локальная матрица зрелости

- `tests/unit/concurrency-inmemory.test.ts` моделирует двадцать повторных
  стартов и отправок с одним ключом, а также двадцать разных ключей. Локально
  подтверждены один claim, одно сообщение и девятнадцать повторов или отказов.
- `tests/unit/admin-login-error-matrix.test.ts` закрывает CSRF, повреждённый
  JSON, тело-массив, неверный ключ, `429` с `Retry-After` и успешную cookie
  административной сессии.
- `tests/unit/operational-secret-scan.test.ts` запрещает прямую запись
  исключений, стеков и секретов в журналы и фиксирует безопасный формат
  `event`/`error_name`.

Эти проверки усиливают локальную модель и контракт исходного кода, но не
заменяют двадцать конкурентных транзакций PostgreSQL, боевой HTTPS, внешний
сбор журналов или резервное копирование.

## Итерация 35 — локальные контракты качества

- `tests/unit/session-csrf-contracts.test.ts` фиксирует выдачу и замену CSRF,
  флаги файлов cookie, отказ при несовпадающей паре и запись только
  производного идентификатора сессии.
- `scripts/verify-documentation.mjs` и `tests/unit/documentation-contract.test.ts`
  сверяют `README.md`, `package.json` и `.env.example`, включая команды,
  endpoint’ы, переменные окружения и отсутствие незаполненных маркеров.
- `tests/unit/russian-comments-contract.test.ts` проверяет, что каждый
  исполняемый исходный модуль имеет русскоязычное пояснение и не содержит
  англоязычных пояснительных комментариев; служебные директивы линтера
  исключаются из этого правила.

## Functional acceptance

| ID | Статус | Evidence / remaining gap |
| --- | --- | --- |
| AT-F-001 | `PASS-L` | `tests/unit/relay.test.ts`, E2E start flow |
| AT-F-002 | `PARTIAL-L` | Основные экраны вручную отрисованы в native Chromium (`/`, `/chains`, `/map`, `/about`, `/admin`); автоматический headless UI assertion блокируется sandbox |
| AT-F-003 | `PASS-L` | `tests/unit/text.test.ts` parametrizes 19/20/500/501 Unicode code points and covers astral-symbol counting |
| AT-F-004 | `PASS-L` | `tests/unit/text.test.ts` covers all local text rejection reasons: words, control characters, backslash, HTML, URL, email, phone and payment card |
| AT-F-005 | `PARTIAL-L` | `tests/unit/concurrency-inmemory.test.ts` проверяет двадцать наложенных стартов и один claim; PostgreSQL race не выполнен |
| AT-F-005a | `PARTIAL-L` | In-memory lifecycle test verifies one active claim per session; PostgreSQL concurrent uniqueness remains external |
| AT-F-005b | `PARTIAL-L` | Проверка конкурентных запросов подтверждает одно принятое сообщение при двадцати одинаковых отправках и отсутствие второго сообщения; гонка PostgreSQL остаётся внешней |
| AT-F-005c | `PARTIAL-L` | Local expired-claim replacement проверен, same-transaction DB path — нет |
| AT-F-006 | `PARTIAL-L` | Local clock/181-second expiry test; server-time PostgreSQL check — нет |
| AT-F-006a | `PARTIAL-L` | Route-level cancel success/CSRF, unknown claim, wrong session and terminal conflicts covered by `terminal-http-matrix.test.ts`; PostgreSQL transition still external |
| AT-F-007 | `PASS-L` | Повторная отправка с тем же ключом сохраняет одно message; это подтверждено relay и локальной проверкой двадцати запросов |
| AT-F-007a | `NC` | Post-commit network timeout не имитирован |
| AT-F-007b | `PARTIAL-L` | Same-key submit с изменённым text и country получает `IDEMPOTENCY_KEY_REUSED` локально; post-commit timeout остаётся external |
| AT-F-008 | `BLOCKED-E` | Harness содержит двадцать одновременных PostgreSQL-отправок с одинаковым ключом, но без `DATABASE_URL` они не выполнены |
| AT-F-009 | `PASS-L` | Local relay completes exactly after 12 accepted hops |
| AT-F-010 | `PASS-L` | Invite start после 12-го сообщения возвращает `CHAIN_COMPLETED` и не создаёт 13-й claim |
| AT-F-011 | `PASS-L` | Public-state unit test не раскрывает seed/active messages |
| AT-F-012 | `PARTIAL-L` | Local 12-message completion и gallery model; completed browser page не проверена |
| AT-F-012a | `PASS-L` | Lifecycle test verifies immutable theme title and seed snapshots after theme edits |
| AT-F-012b | `PARTIAL-L` | Lifecycle test covers redacted PAUSED/ARCHIVED and visible COMPLETED states; full HTTP matrix remains |
| AT-F-013 | `PARTIAL-L` | Source contract covers keyboard-operable copy/share buttons and clipboard fallback; browser interaction remains |
| AT-F-014 | `PARTIAL-L` | In-memory duplicate report проверен, anonymous HTTP flow — нет |
| AT-F-015 | `PARTIAL-L` | `public-query-matrix.test.ts` проверяет безопасный пустой payload при `MAP_ENABLED=false`; browser/UI relay check не выполнен |
| AT-F-016 | `PARTIAL-L` | In-memory start без active seed возвращает `NO_ACTIVE_SEED`; clean PostgreSQL seed path остаётся external |
| AT-F-017 | `PARTIAL-L` | Same-key start replay локально проверен, post-commit timeout — нет |
| AT-F-018 | `PARTIAL-L` | In-memory matrix покрывает reuse, TTL и cancelled replay; PostgreSQL transaction path остаётся external |
| AT-F-019 | `PASS-L` | E2E invite continuation стартует в указанной chain |
| AT-F-020 | `PARTIAL-L` | Relay and HTTP tests cover wrong-session/paused/completed/cancelled/expired mappings; PostgreSQL token lifecycle remains external |
| AT-F-021 | `PASS-L` | Lifecycle test rejects invite start after the same session has submitted a message |
| AT-F-022 | `PARTIAL-L` | `tests/unit/privacy-payload-contracts.test.ts` и `InMemoryRelay.stats()` фиксируют rolling-90-day participant window и lifetime saved-message count; clean PostgreSQL execution остаётся external |
| AT-F-023 | `PARTIAL-L` | Lifecycle/HTTP tests cover recover after pause/archive/cancel/completion; PostgreSQL harness adds completed/archive transitions, но база не подключена |
| AT-F-024 | `PARTIAL-L` | `terminal-http-matrix.test.ts` covers cancelled/expired/not-found cancel and exact session ownership; PostgreSQL transition remains external |
| AT-F-025 | `PARTIAL-L` | `terminal-http-matrix.test.ts` covers submitted claim recovery and terminal precedence; PostgreSQL transition remains external |
| AT-F-026 | `BLOCKED-E` | Deferred FK и atomic start commit требуют clean PostgreSQL |
| AT-F-027 | `PARTIAL-L` | Invite start с другим языком покрыт relay/HTTP mapping tests; clean PostgreSQL claim absence остаётся external |
| AT-F-028 | `PARTIAL-L` | `http-body-matrix.test.ts` расширяет malformed body, типы и лишние поля для start/submit/recover; unknown claim/full idempotency matrix remains |
| AT-F-029 | `PARTIAL-L` | HTTP matrix covers expired recovery mapping and source tests cover opaque retention; DB row atomicity remains external |
| AT-F-030 | `PARTIAL-L` | In-memory status precedence и PostgreSQL helper order покрыты review/unit contract; production transaction path остаётся external |
| AT-F-031 | `PARTIAL-L` | Recover без claim текущей session и wrong-session HTTP mapping покрыты локально; DB row assertion остаётся external |
| AT-F-032 | `PARTIAL-L` | Country normalization участвует в local relay/map; terminal HTTP matrix добавляет cancel unknown claim, PostgreSQL path остаётся external |
| AT-F-033 | `PASS-L` | Normalized duplicate text оставляет claim active |
| AT-F-034 | `PARTIAL-L` | Local tests distinguish cap `NO_CHAIN_AVAILABLE` from below-cap `NO_ACTIVE_SEED`; advisory-lock race остаётся external |
| AT-F-035 | `PARTIAL-L` | `http-body-matrix.test.ts` расширяет malformed/non-object/unknown body, invalid reason, empty and oversized details; DB persistence matrix remains |
| AT-F-036 | `PARTIAL-L` | Anonymous HTTP report creates a sid cookie and passes a session hash; persisted DB flow remains |
| AT-F-037 | `PARTIAL-L` | Lifecycle/HTTP tests cover completed-only report and serialization; PostgreSQL harness adds archive closure, DB transaction race remains |
| AT-F-038 | `PARTIAL-L` | `http-body-matrix.test.ts` и route tests покрывают malformed JSON, null/array, unknown fields, типы и malformed `public_code`; полный runtime matrix остаётся |
| AT-F-039 | `BLOCKED-E` | Archive/report race требует конкурентных PostgreSQL transactions |
| AT-F-040 | `PARTIAL-L` | `admin-mutation-matrix.test.ts` и `terminal-http-matrix.test.ts` проверяют dismiss/hide/archive HTTP contracts, CSRF, serialization и repeated terminal transitions; full persistence matrix remains |
| AT-F-041 | `PARTIAL-L` | Recover missing session, malformed JSON, null/array, missing/unknown fields, invalid public/recovery keys and terminal mappings are covered; full persistence matrix remains |
| AT-F-042 | `PARTIAL-L` | `AA`, `ZZ` и malformed string country codes покрыты in-memory и HTTP mapping tests; PostgreSQL path остаётся external |
| AT-F-043 | `BLOCKED-E` | Serialization/deadlock retry exhaustion требует PostgreSQL fault injection |
| AT-F-044 | `PARTIAL-L` | `admin-mutation-matrix.test.ts` и `terminal-http-matrix.test.ts` покрывают повторные dismiss/hide/archive → `REPORT_ALREADY_RESOLVED`; DB race remains |
| AT-F-045 | `PARTIAL-L` | `maintenance-soak.test.ts` проверяет двадцать архивирований, отмену claims и повторный запуск; DB atomicity — нет |
| AT-F-046 | `PARTIAL-L` | `http-body-matrix.test.ts` покрывает submit malformed JSON, null/array, missing/unknown fields и неправильные типы до relay; полный persistence matrix остаётся |
| AT-F-047 | `PARTIAL-L` | Exhausted report bucket returns `RATE_LIMITED`, `Retry-After` and preserves anonymous sid; cross-instance DB bucket integration remains |

## Security and privacy acceptance

| ID | Статус | Evidence / remaining gap |
| --- | --- | --- |
| AT-S-001 | `PARTIAL-L` | `tests/unit/privacy-payload-contracts.test.ts` проверяет `sid_hash`, `session_hash` и `scope_hash` в schema/runtime; отдельная clean-DB inspection не выполнена |
| AT-S-002 | `PARTIAL-L` | Privacy contract проверяет хеширование IP scope и отсутствие persistent exact-IP columns; dedicated production DB/security scan не выполнен |
| AT-S-003 | `PARTIAL-L` | Privacy contract прогоняет public chain/gallery/map/stats/admin serializers с session/IP markers; полный production API/analytics payload scan не выполнен |
| AT-S-004 | `PARTIAL-L` | Статическая XSS-проверка, React/JSON-сериализация и сокрытие скрытых сообщений покрыты; full browser/XSS audit remains |
| AT-S-005 | `PARTIAL-L` | `session-csrf-contracts.test.ts` проверяет анонимную HttpOnly-сессию, замену повреждённой sid-cookie и запись только производного `sid_hash`; чистая база остаётся external |
| AT-S-006 | `PARTIAL-L` | Административный маршрут с обычной или отсутствующей cookie возвращает `ADMIN_REQUIRED`; матрица входа добавляет CSRF, проверку неверного ключа и ограничения частоты запросов |
| AT-S-007 | `PARTIAL-L` | Client source scan rejects server-only environment variables; built bundle inspection remains |
| AT-S-008 | `PARTIAL-L` | `/about` source contract covers contacts, mailto attributes and aria labeling; browser rendering remains |
| AT-S-009 | `PARTIAL-L` | Session CSRF rejection и terminal HTTP matrix покрыты локально; production mutation/HTTPS matrix remains |
| AT-S-010 | `PARTIAL-L` | Session test фиксирует HttpOnly/SameSite/Max-Age, а source contract — HSTS/CSP; real HTTPS admin login remains external |
| AT-S-011 | `PARTIAL-L` | AES-256-GCM round-trip и 32-byte key validation проверены unit-level; startup/DB path — нет |
| AT-S-012 | `PARTIAL-L` | Local fixed-window limiter tests есть; PostgreSQL cross-instance bucket check — blocked external |

## UX and accessibility acceptance

| ID | Статус | Evidence / remaining gap |
| --- | --- | --- |
| AT-U-001 | `PARTIAL-L` | Source contract covers explicit reply/select labels; browser/axe audit не выполнен |
| AT-U-002 | `PARTIAL-L` | Admin tablist/tabpanel and report disclosure semantics are covered by existing source contracts; iteration 39 adds explicit report `label`/`id` pairs; full browser traversal remains external |
| AT-U-003 | `PARTIAL-L` | Global `:focus-visible` now covers native controls and positive `tabindex`, with admin tab focus contract; manual traversal audit remains |
| AT-U-004 | `PARTIAL-L` | Static WCAG token audit and iteration 39 contrast assertions check core text, muted text, accent button and error colors; overlays, gradients and computed browser contrast remain external |
| AT-U-005 | `PARTIAL-L` | Countdown has polite live region and atomic updates in source; browser announcement not observed |
| AT-U-006 | `PARTIAL-L` | `prefers-reduced-motion` CSS contract есть; OS/browser behavior not observed |
| AT-U-007 | `PARTIAL-L` | Semantic country/count table source contract exists; browser visual/text-table check remains |
| AT-U-008 | `PARTIAL-L` | Overflow guard and <=360px responsive source contract есть; 320px browser check не выполнен |
| AT-U-009 | `PARTIAL-L` | LocalStorage draft persistence and restoration source contracts exist; offline browser check remains |
| AT-U-010 | `PARTIAL-L` | Chain error/loading and report disclosure regions expose recoverable roles and labelled actions; browser copy/focus audit не выполнен |
| AT-U-011 | `PARTIAL-L` | Metrics section naming and token formula source contracts exist; visual/browser check remains |

## Operational acceptance

| ID | Статус | Evidence / remaining gap |
| --- | --- | --- |
| AT-O-001 | `PARTIAL-L` | Health contract unit покрывает DB success mock; production HTTPS probe blocked |
| AT-O-002 | `BLOCKED-E` | Optional harness расширен до схемы, deferred FK и mutation checks, но реальный migration run требует чистой PostgreSQL |
| AT-O-003 | `BLOCKED-E` | Optional harness проверит seeded counts и lifecycle на подключённой базе, но фактический seed 20+20 не выполнен |
| AT-O-004 | `BLOCKED-E` | Backup target/storage не подключён |
| AT-O-005 | `BLOCKED-E` | Restore test требует backup artifact и PostgreSQL |
| AT-O-006 | `NC` | Alert provider/5xx alert rule не настроен и не проверен |
| AT-O-007 | `PARTIAL-L` | In-memory maintenance plus source-level retention deletes are covered; production retention SQL не прогнан |
| AT-O-008 | `PARTIAL-L` | Soak contract проверяет повторное maintenance и bounded cleanup; DB concurrency/retention не проверены |
| AT-O-009 | `PASS-L` | `npm run maintenance` and maintenance route tested for auth edge cases, timeout, failure, safe output and all non-POST methods |
| AT-O-010 | `PARTIAL-L` | Source contract verifies exact `/api/v1/internal/maintenance` cron and `* * * * *`; deployment confirmation отсутствует |
| AT-O-011 | `PARTIAL-L` | Crypto and source retention contracts cover opaque payloads, inactive claim cleanup and stale recovery deletion; DB retention run remains |
| AT-O-012 | `PARTIAL-L` | Admin mutation matrix covers theme/chain HTTP validation, serialization and transitions; cap/atomic rollback matrix не полный |
| AT-O-013 | `PARTIAL-L` | Admin pause/resume/archive contracts and in-memory cancellation/report closure are covered; PostgreSQL transition race — нет |
| AT-O-014 | `BLOCKED-E` | Advisory-lock concurrency requires real PostgreSQL |
| AT-O-015 | `PASS-L` | Maintenance route unit + E2E auth and no-cookie behavior |
| AT-O-016 | `PARTIAL-L` | Soak contract проверяет управляемые часы, expiry/archival и сохранение completed history; full `last_activity_at` DB fixture — нет |
| AT-O-017 | `PARTIAL-L` | `admin-query-matrix.test.ts` covers status/language/theme filters, limits 1/50/>50, signed cursors and invalid pagination inputs; browser matrix remains |
| AT-O-018 | `PARTIAL-L` | Health unit covers exact success/failure bodies; production preflight and maintenance contracts cover invalid timeout/URL and safe failure; real DB/HTTPS probe blocked |
| AT-O-019 | `PARTIAL-L` | Readiness verifier and source contracts check normative NOT NULL/retention declarations; NULL insert on clean DB not run |
| AT-O-020 | `PARTIAL-L` | Source contract checks parent-chain → claim lock order; concurrent deadlock test not run |
| AT-O-021 | `PARTIAL-L` | In-memory/admin archive and source archival paths close reports; PostgreSQL transaction not run |

## P1 map acceptance

| ID | Статус | Evidence / remaining gap |
| --- | --- | --- |
| AT-P1-001 | `PASS-L` | In-memory map unit проверяет k-anonymity buckets |
| AT-P1-002 | `PARTIAL-L` | `public-query-matrix.test.ts` покрывает выбор периодов `24h` и `all`; fixture/browser verification remains |
| AT-P1-003 | `PARTIAL-L` | Lifecycle и XSS contracts покрывают состояние скрытого сообщения, сохранённую историю и безопасную public serialization; public query/browser audit remains |
| AT-P1-004 | `PARTIAL-L` | Semantic map table and accessible map source contracts exist; browser SVG/text-table check remains |
| AT-P1-005 | `PARTIAL-L` | `tests/unit/privacy-payload-contracts.test.ts` checks aggregate map payload, k-anonymity, `OTHER`/`UNKNOWN` and no raw location/session markers; dedicated clean-DB query test не выполнен |

## Explicit external gates

Следующие пункты нельзя считать выполненными без внешней среды:

- PostgreSQL на чистой базе: migration, seed, deferred FK commit, NULL rejection;
- 20-way submit race и report/archive/deadlock fault-injection;
- production HTTPS health probe и Vercel Cron deployment confirmation;
- ежедневный backup, restore и alert delivery;
- browser UI, accessibility, responsive/offline и visual regression runs;
- performance/soak gates.

Ledger намеренно не превращает наличие кода в доказательство прохождения
acceptance criteria: для внешних и ручных пунктов оставлены `BLOCKED-E` или `NC`.

