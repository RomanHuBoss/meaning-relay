# Mobile audit

Captured with Playwright against the local dev server at four viewport sizes.

- 320 × 800
- 375 × 812
- 390 × 844
- 412 × 915

Routes checked were `/`, `/?join=1`, `/chains`, `/map`, and `/about`. The join flow was also exercised from language selection into the turn screen.

## Findings and fixes

- The home fragment callouts inherited desktop `!important` geometry and overlapped on narrow screens. Mobile overrides now use a compact three-level cascade, smaller glass callouts, and an anchored live-fragment label.
- The turn progress rail required `minmax(24px, 1fr)` for each of twelve nodes, which clipped the last node at 320px. Mobile CSS now uses twelve flexible columns with a 1px gap.
- The Japan map label extended 2px beyond the 320px viewport. It is shifted inward below 360px.
- The mobile header initially hid the four primary navigation links. They now wrap into a compact row above the join CTA, preserving access to Home, Gallery, Map, and Rules.
- The map activity table now keeps the country code and count visually separated on narrow cards.
- No user-facing horizontal overflow remains. `document.documentElement.scrollWidth` equals the viewport width for every checked route and viewport. The body width includes only the intentionally clipped fixed galaxy decoration.

## Evidence

- `320-home-orbit-current-after-parent.png`
- `320-turn-rail-fixed.png`
- `320-map-current.png`
- `320-chains-viewport-current.png`
- `320-about-viewport-current.png`
- `metrics-final.json`

The final responsive run covers 24 captures across the five public routes and the live turn screen. It reports zero horizontal-overflow, offscreen-control, console-error, or failed-request findings.
