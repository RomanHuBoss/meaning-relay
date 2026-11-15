# Design QA

source visual truth paths

- `C:\Users\roman\AppData\Local\Temp\codex-clipboard-7301808e-d784-403d-bf77-7b21b6470114.png` for the home chain fragment.
- `C:\Users\roman\AppData\Local\Temp\codex-clipboard-8310369d-55fc-4b07-95fd-d98d59d1da4e.png` for the statistics tile highlights.
- `C:\Users\roman\AppData\Local\Temp\codex-clipboard-1247d310-0a0f-411b-b651-c9ddc7f17479.png` for the map and ranking composition.
- `C:\Users\roman\AppData\Local\Temp\codex-clipboard-42af2ff9-b498-4eba-a7c5-2491aa35257e.png` for the language selection screen.

implementation evidence

- `artifacts/visual-check/home-sketch-one-to-one.png`
- `artifacts/visual-check/home-premium-glow-labels.png`
- `artifacts/visual-check/home-fragment-premium-final.png`
- `artifacts/visual-check/home-fragment-callouts-final.png`
- `artifacts/visual-check/home-callouts-final.png`
- `artifacts/visual-check/home-fragment-premium-polished.png`
- `artifacts/visual-check/home-callouts-locale-safe-final.png`
- `artifacts/visual-check/home-fragment-locale-safe-final.png`
- `artifacts/visual-check/home-fragment-callouts-direction-fixed.png`
- `artifacts/visual-check/home-fragment-callouts-spread-label-lifted.png`
- `artifacts/visual-check/home-fragment-callouts-steeper-label-higher.png`
- `artifacts/visual-check/home-fragment-zh-cascade-fixed.png`
- `artifacts/visual-check/home-fragment-ru-final.png`
- `artifacts/visual-check/home-fragment-en-final.png`
- `artifacts/visual-check/home-fragment-es-final.png`
- `artifacts/visual-check/home-fragment-zh-final.png`
- `artifacts/visual-check/home-fragment-fr-final.png`
- `artifacts/visual-check/home-fragment-hi-final.png`
- `artifacts/visual-check/verified-map.png`
- `artifacts/visual-check/map-dots-micro.png`
- `artifacts/visual-check/map-dots-uniform-large.png`
- `artifacts/visual-check/map-dots-scaled.png`
- `artifacts/visual-check/verified-gallery.png`
- `artifacts/visual-check/verified-rules.png`
- `artifacts/visual-check/flow-language-fit2.png`
- `artifacts/visual-check/language-next-turn.png`
- `artifacts/visual-check/language-no-fake-rail.png`
- `artifacts/visual-check/language-lines-fixed.png`
- `artifacts/visual-check/language-canvas-clean.png`
- `artifacts/visual-check/language-canvas-final.png`
- `artifacts/mobile-audit/metrics-final.json`
- `artifacts/mobile-audit/320x800-home.png`
- `artifacts/mobile-audit/320x800-join-1.png`
- `artifacts/mobile-audit/320x800-map.png`
- `artifacts/mobile-audit/320x800-turn.png`
- `artifacts/visual-check/map-locale-ru.png`
- `artifacts/use-case/report.md`
- `artifacts/use-case/completed-chains.json`
- `artifacts/use-case/screens/05-completed-chain-ru.png`
- `artifacts/use-case/screens/07-gallery-completed.png`
- `artifacts/use-case/screens/08-map-all-data.png`

viewport and state

- Desktop 1920 x 1080 CSS pixels, device scale factor 1.
- Dark galaxy theme, Russian interface, public navigation visible.
- Home landing state, empty gallery state, 24-hour map state, rules page, and language selection state.

full-view comparison evidence

- Home now uses the same galaxy canvas, five-item navigation, glass stats surfaces, and a smooth 12-node fragment with cream completed nodes, a single lime current node, and a muted tail.
- Map uses the galaxy canvas through the map panel, a transparent map surface, a microdot-only world silhouette with no country outline layer, readable country markers, glass side panel, and ranking panels below.
- Gallery, rules, and language screens use the same border, translucency, lower-edge highlight, and button treatment.

focused comparison evidence

- Home fragment and stats were reviewed against the supplied fragment crop and stats crop after five iterations. The active segment now runs 06 → 07 with a warm-to-lime spectral gradient, each marker has a phase-specific halo, the tail narrows and fades progressively through 12, and each locale-aware callout connector reaches marker 01, 04, or 07 through a thin CSS connector that follows the actual text block height. The callout surfaces use the reference glass gradient and contour glow. The unexpected lime corner stroke was removed from stats tiles. Evidence `artifacts/visual-check/home-fragment-locale-safe-final.png` and the six locale captures listed above.
- Language screen was reviewed at 1920 x 1080 after a desktop-fit iteration. Rail and CTA are visible in the first viewport.
- Language screen was rechecked at 1440 x 900 after removing the duplicated body galaxy layer and the empty panel frame. The screen now uses the shared fixed galaxy backdrop, and the language cards plus CTA fit inside the first viewport.
- Mobile audit was rechecked at 320, 375, 390, and 412 CSS pixels across the public routes and the live turn screen. The final run contains 24 captures with no horizontal overflow, offscreen controls, console errors, or failed requests.
- Map aggregate labels were checked in all six interface locales. `OTHER` and `UNKNOWN` now render as localized aggregate labels and subtitles.
- End-to-end use-case audit completed the relay flow through four 12-hop chains and verified that their results appear in gallery, map aggregates, and public chain pages.
- Navigation was checked through the rendered DOM on home, gallery, map, and rules. Each route renders `Главная`, `Галерея`, `Карта`, `Правила`, and `Вступить` in the same order.

comparison history

1. Large radial stats blobs differed from the sketch. Replaced them with layered glass gradients and controlled bottom reflections. Evidence `artifacts/visual-check/recheck-home.png`.
2. The home fragment curve and node colors differed from the sketch. Rebuilt the path and node palette, then moved the live segment to 06 → 07. Evidence `artifacts/visual-check/home-sketch-one-to-one.png`.
3. The map had a dark central underlay. Removed the map canvas fill, raised map contrast, and preserved the galaxy through the canvas. Evidence `artifacts/visual-check/current-map-refined.png`.
4. Header navigation varied by route. Replaced route-local menus with `components/public-nav.tsx` and verified the same DOM labels on all public routes.
5. The language screen exceeded the first viewport. Reduced desktop-only spacing and verified `artifacts/visual-check/flow-language-fit2.png`.

remaining expected state

- The local API currently returns zero map events and zero completed/saved counters. Empty ranking rows and zero values in evidence are data state, not a rendering error.
- Browser interaction check completed without console errors. The join CTA opens the language screen and the map period switch changes to `Всё время`.
- Live turn state evidence: `artifacts/visual-check/turn-country-control.png`; duplicate step metadata and the extra progress bar were removed from the top. Map label clutter was removed and marker dots were rebuilt as complete glass tags. Cancellation now clears persisted claim state before navigation. The country control now has a visible label and flag/globe signal. Rules links use `/about` and the button radius system is shared across screens.

final result: passed
