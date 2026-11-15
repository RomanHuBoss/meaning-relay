# Functional route audit

Run date 2026-11-15. Viewport 1440 x 900. Evidence uses the screenshots captured in this run.

1. Home `/` — healthy. Navigation, locale picker, hero CTA, rules link, and live fragment render without console errors. Evidence `audit-.png`.
2. Gallery `/chains` — healthy. Empty state is readable and `Начать цепочку` links to `/?join=1`. Evidence `audit-chains.png`.
3. Map `/map` — healthy. Period switch changes to `Всё время`, dot map layer is present, and no console errors occur. Evidence `audit-map.png`, `audit-map-after-toggle.png`.
4. Rules `/about` — healthy. Shared navigation and rule cards render without console errors. Evidence `audit-about.png`.
5. Join `/?join=1` — healthy. Language-selection screen opens and the CTA is visible in the captured viewport. Evidence `audit-join-1.png`.
6. English locale — healthy. Switching to English updates the global navigation and hero copy, persists `meaning-relay:ui-locale`, and the join CTA still opens the language screen. Evidence `audit-locale-en-join.png`.

Limits: this pass did not submit a live turn or test PostgreSQL-backed production data. It checked route behavior against the local API and in-memory development state.
