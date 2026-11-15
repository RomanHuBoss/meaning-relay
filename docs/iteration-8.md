# Итерация 8 — redaction contract и финальный frontend gate

## Публичное скрытие сообщений

После `hide_message` публичный endpoint завершённой цепочки заменяет текст
сообщения с `moderation_status=HIDDEN` на фиксированный placeholder
`[сообщение скрыто модератором]`. Исходный текст не попадает в JSON ответа.

Метрики результата вычисляются до этой замены по сохранённому source text:
длины, unique-word counts и token overlap остаются стабильными после
модерационного решения. Логика redaction вынесена в
`lib/http/public-chain.ts` и покрыта отдельным unit test.

## Frontend quality gate

Внутренняя навигация публичных и административных экранов использует
`next/link`, чтобы сохранить client-side переходы и убрать Next.js navigation
warnings. Локальная SVG-карта использует `next/image` с `fill` и адаптивным
`sizes`; существующая геометрия и alt-текст сохранены.

На странице результата добавлены кнопки «Скопировать ссылку» и «Поделиться».
В браузерах с Web Share API используется системный share sheet, в остальных
случаях применяется clipboard fallback. Результат операции сообщается через
`role="status"`.

Проверки итерации:

- `npm test` — 29 тестов;
- `npm run typecheck` — пройден;
- `npm run lint` — 0 ошибок и 0 предупреждений;
- `npm run build` — production build, 24 маршрута.
