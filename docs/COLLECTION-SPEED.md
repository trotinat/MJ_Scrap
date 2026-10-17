# Collection speed update

## Installed first

Graphify 0.9.92 (`graphifyy` from PyPI; upstream Graphify-Labs/graphify) is isolated at `C:/Users/user/.codex/tools/graphify`. Its Codex skill is installed at `C:/Users/user/.codex/skills/graphify/SKILL.md`, available next turn. Explicit executable/interpreter paths are recorded in the skill for this Windows installation. No repository dependencies, hooks, routing settings, or hosted Graphify account were added.

## Collection changes

- Default 30-minute detail cache, configurable 0–120 minutes. Reuse requires an unchanged title, seller, price, old price and discount, active/in-stock status, recent successful details, and existing positive matches evaluated after both criterion/settings changes. No new alert is emitted from a cached/listing-only observation.
- Changed prices or expired details require another product request. New user-search alerts require a successful detail observation; hitting the detail budget does not bypass this requirement.
- General promo listings may be deferred for six hours on scheduled/catch-up runs. Personal-search listings still run every time. Manual runs read all configured listings. This is a separate refresh interval, not an increase in scheduler frequency.
- Simple promotion observations are saved before slower candidate detail requests. The UI refreshes about every 15 seconds while a run is active; progress counts are persisted about every two seconds during storage.
- Previous matches are read once per offer rather than once per criterion. All listing appearances for an offer are upserted together.
- Collection summaries show reused details/skipped promo pages. Product pages distinguish last successful observation from the timestamp of size/stock verification.
- Existing request delay, robots rules, access-refusal handling, and conservative missing policy remain in effect.

## Expected impact and limits

Most benefit is on repeated runs within the cache window and on frequent scheduled runs. Cold/full scans still require fresh product pages and normal request pacing. No live wall-clock speedup percentage has been measured. Defaults are visible in Settings (30 minutes / 6 hours); zero disables either optimisation.

Validation: isolated PostgreSQL pipeline tests cover cache reuse, expiry, price-change refresh, no duplicate cached alerts, manual/scheduled promo coverage, blocked-site partial data, missing policy and scheduler behavior. Final full-suite/build results recorded in chat.
