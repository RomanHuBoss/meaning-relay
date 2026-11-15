# Итерация 34 — accessibility source contracts

## Сделано

- Усилен глобальный keyboard focus contract: `:focus-visible` применяется к
  интерактивным элементам и положительным `tabindex`, а admin tab control
  получает отдельный offset и визуальный selected state.
- Admin navigation переведена на семантику `tablist`/`tab`/`tabpanel`.
  Кнопки имеют явный `type="button"`, `aria-selected`, `aria-controls` и
  стабильные id панелей, поэтому переключение доступно с клавиатуры и имеет
  читаемую связь с содержимым.
- Страница публичной цепочки получила recoverable error region (`role="alert"`
  с заголовком и ссылкой возврата), polite loading status и disclosure contract
  для формы жалобы (`aria-expanded`, `aria-controls`, labelled region).
- Добавлен WCAG-aware static token audit для `--ink`, `--muted`, `--accent` и
  `--bg`: вычисляется относительная яркость и проверяются пороги 4.5:1 для
  обычного текста и 3:1 для accent UI/large text.

## Evidence и границы

- Добавлен `tests/unit/a11y-iteration34-source.test.ts`: **4 теста** для
  focus visibility, contrast tokens, admin tab traversal semantics и
  recoverable chain/report states.
- `npm run test -- tests/unit/a11y-iteration34-source.test.ts`,
  `npm run typecheck`, `npm run lint` и `git diff --check` проходят локально.
- Source contracts не заменяют ручной keyboard traversal, браузерный axe,
  computed contrast на градиентах/полупрозрачных поверхностях и visual
  regression; эти проверки остаются внешними.

## Частично закрытые acceptance items

- AT-U-002: добавлены tablist/panel и disclosure связи, полный traversal всех
  экранов ещё требует browser audit.
- AT-U-003: глобальный focus contract усилен и покрыт тестом; проверка порядка
  фокуса в браузере остаётся внешней.
- AT-U-004: core color token ratios проверяются статически; overlay,
  gradient и responsive visual contrast требуют axe/browser evidence.
- AT-U-010: цепочка ошибки, загрузка и report recovery имеют объявляемые
  состояния и действие возврата; ручная проверка копирайта/фокуса остаётся.
