# Use-case end-to-end run

Run date 2026-11-15 against the local in-memory dev server at `http://127.0.0.1:3200`.

## UI flow

1. **Landing** — rendered the home screen and live fragment. Evidence `screens/01-home-before.png`.
2. **Language selection** — opened from `Вступить`, checked all six language cards and CTA. Evidence `screens/02-language-selection.png`.
3. **Turn screen** — started a Russian chain, checked the relay rail, source message, timer, country selector, textarea, submit and cancellation controls. Evidence `screens/03-turn-screen.png`.
4. **Accepted turn** — submitted a valid continuation and checked the saved-turn state and progress. Evidence `screens/04-received-screen.png`.
5. **Cancellation** — started another turn, cancelled participation, and verified return to the landing screen. Evidence `screens/10-turn-before-cancel.png` and `screens/11-cancelled-return-home.png`.
6. **Completed Russian chain** — opened the public result after 12 API submissions. Evidence `screens/05-completed-chain-ru.png`.
7. **Completed English chain** — opened the public result after 12 API submissions. Evidence `screens/06-completed-chain-en.png`.
8. **Gallery discovery** — opened `/chains` and found four completed chains, including both newly completed chains. Evidence `screens/07-gallery-completed.png`.
9. **Map and aggregates** — opened `/map`, checked the map dots, country activity, rankings, aggregate labels and updated totals. Evidence `screens/08-map-all-data.png`.
10. **Updated home statistics** — returned to the home page and verified completed-chain and saved-turn counters. Evidence `screens/09-home-updated-stats.png`.

## API flow

- Two chains completed at hop 12. Russian code `Ju5T9yrhXJ`. English code `41itNA437m`.
- Gallery returned four completed chains.
- Public stats at the end of the audit included 4 completed chains, 55 saved messages and 53 participants.
- Map all-time aggregation returned RU, US and UNKNOWN buckets.
- Cancel returned HTTP 204. A submit after cancellation returned HTTP 409 `CLAIM_CANCELLED`.
- Recovery returned HTTP 200 and an idempotent replay returned the same claim and token.
- Public chain lookup returned HTTP 200. A moderation report on a completed-chain message returned HTTP 201 with status `OPEN`.
- Repository HTTP smoke `npm run test:e2e` passed four tests. The optional browser-public-pages test remained skipped because `E2E_BROWSER=1` was not enabled.

Raw records are saved in `completed-chains.json` and `operations.json`.

After the HTTP smoke server restart, the same completion run was repeated in the current development process. The current live in-memory state contains Russian chain `AyS2i4yHGJ` and English chain `cRWU1jjisn`, both at 12/12. Current public totals are two completed chains and 24 saved messages. Final-state screenshots use the `*-final.png` files in `screens` and the raw snapshot is `completed-chains-final.json`.

## Limits

The run uses the local in-memory adapter. PostgreSQL persistence and production deployment were covered by unit and readiness checks, while the live chain walkthrough uses the development runtime.
