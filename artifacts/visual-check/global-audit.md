# Global product audit

Run date 2026-11-15. The audit used fresh Playwright captures from the local dev server and the supplied visual references in `design-qa.md`.

## Steps

1. **Главная `/`** — healthy. The shared header, locale picker, hero CTA, rules link, live chain fragment, stats tiles, and three-step section render on desktop and mobile. The mobile hero now uses one column and preserves the fragment callout cascade.
2. **Выбор языка `/?join=1`** — healthy. All six language cards remain reachable, the next-turn CTA is localized, and the screen fits without horizontal overflow at 320, 375, 390, and 412 CSS pixels.
3. **Экран хода** — healthy. The 12-step rail fits at 320px, the title wraps by words, the country selector stays inside the reply card, and the submit, timer, memo, and cancellation controls remain reachable. The client timer now uses the same 180-second claim TTL as the server and disables submission at zero.
4. **Галерея `/chains`** — healthy. Filters stack cleanly, the empty state stays readable, and `Начать цепочку` opens the language screen.
5. **Карта `/map`** — healthy. The map uses the dot-only silhouette, marker labels stay inside the mobile viewport, the activity table separates country codes from counts, aggregate labels such as `ДРУГИЕ` and `НЕ УКАЗАНО` follow the selected interface language, and the period switch remains usable.
6. **Правила `/about`** — healthy. Rule cards and privacy content stack without clipping on narrow screens.
7. **Locale and navigation** — healthy. The same five navigation destinations remain available on mobile and desktop. Locale selection persists and updates the visible copy. Navigating from `/?join=1` to `/` now resets the in-memory view from language selection to the landing screen.

## Evidence

- Desktop route audit: `audit-functional.md`.
- Mobile audit report: `../mobile-audit/report.md`.
- Responsive metrics: `../mobile-audit/metrics-final.json`.
- Desktop home: `audit-.png`.
- Desktop map: `audit-map.png`.
- Desktop language screen: `audit-join-1.png`.
- Mobile home: `../mobile-audit/320x800-home.png`.
- Mobile language screen: `../mobile-audit/320x800-join-1.png`.
- Mobile map: `../mobile-audit/320x800-map.png`.
- Mobile turn screen: `../mobile-audit/320x800-turn.png`.

## Automated result

The responsive run covers 24 captures across five public routes and the live turn screen at 320, 375, 390, and 412 CSS pixels. It found zero horizontal-overflow, offscreen-control, console-error, or failed-request findings.

## Limits

The audit runs against the local in-memory development adapter. It does not prove PostgreSQL production data, device-specific font rasterization, browser zoom behavior, or real network latency. Those require a deployed environment and device matrix.
