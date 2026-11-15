# Итерация 33 — UX и P1 source contracts

## Сделано

- Добавлен `tests/unit/ux-p1-source.test.ts` для локально проверяемых признаков
  offline-friendly поведения, карты и страницы результата.
- Зафиксировано сохранение черновика в `localStorage`: текущий текст
  восстанавливается после перезагрузки и сохраняется до успешной отправки.
- Карта получила семантическую HTML-таблицу с заголовками страны/числа
  передач. Визуальный график остаётся дополнительным представлением, а
  текстовая таблица доступна без SVG/изображения.
- Переключатели периода карты получили `aria-pressed`, а счётчик передач
  объявляется как polite live status.
- Метрики завершённой цепочки объединены в именованную секцию; share/copy
  действия остаются обычными keyboard-operable `button` с fallback на clipboard.
- Для таблицы добавлены адаптивные стили без изменения API payload.

## Evidence и границы

- Targeted UX/a11y source tests: **7 passed**.
- `npm run typecheck`, `npm run lint` и `git diff --check`: passed.
- Source contracts не заменяют ручной keyboard traversal, axe, contrast,
  320px screenshot и browser visual regression; эти проверки остаются внешними.
