# Accuracy and experience update — 16 October 2026

## What changed

- Fashion searches enforce product type, size and gender evidence. URL filters alone do not certify a product attribute. Brand names such as PEPE JEANS no longer qualify sneakers as trousers.
- Profile sizes, genders, budget and brand/seller preferences supply defaults for fashion searches. Search-specific sizes, gender and budget take precedence. Unknown required attributes exclude a personal recommendation.
- Filtered listings use rendered cards instead of unfiltered embedded sliders. Pagination reports actual batches. Limited coverage cannot be used to mark offers missing. Empty extraction is reported as an error.
- Product detail extraction resolves plain embedded Next.js records for the exact product. A configurable price is accepted only when known variant prices agree. Disabled size options do not count as available. A price range's lower bound is not treated as a firm quote.
- Product 404/410 and explicit unavailability take precedence over stale listing cards. Sparse observations preserve richer stored metadata. New products without verified variant facets stay separate rather than being grouped on model alone.
- Seller discounts remain visible, but cannot alone produce a very-good/exceptional score. Personal results exclude inactive, stale and outdated evaluations. General promotions are clearly separated from personal matches and ranked with observed drops first on the home page.
- Telegram now honors proxy configuration, retries transient initialization failures, reports a recent connection state, respects global switches, filters invalid queued matches, and stores successful recipient receipts to avoid resending to them when another recipient fails.
- The home page uses a forest-green and amber design, clear actions, responsive cards and evidence labels. Product images have correct sizing, preserve the actual source image as the primary photo, and show a fallback when unavailable. The existing Houssam Haraf signature is retained.
- Saving a profile requests a new verification. Collection progress notices distinguish partial results from success. Production startup fingerprints local source changes, rather than depending solely on the latest Git commit.
- Local web development binds to loopback. Redirect targets are validated before HTTP requests. Browser navigation checks destinations and pagination uses the configured delay.

## Maintenance

`pnpm reevaluate` refreshes saved matching decisions without crawling or sending alerts. It respects the scrape lock and retires pending messages whose matching criteria no longer hold.

`pnpm start:local` remains the recommended development command. `pnpm reboot` restarts the local stack. `pnpm start:prod` rebuilds when tracked or untracked application source changes.

## Validation

- 134 tests passed, including PostgreSQL integration tests in a separate UTF-8 test database. No integration tests skipped in that run.
- Added regressions for brand/type confusion, unknown and conflicting sizes, profile constraints, stockouts, configurable prices, foreign redirects, truncated-listing absence inference, product 404 precedence, notification switches, invalid matches and per-recipient retries.
- Workspace TypeScript checks passed; optimized web and worker builds passed.
- Browser review covered a 390-pixel phone viewport and a 1366-pixel desktop viewport. Product images and navigation were inspected visually.
- A live crawl exercised HTTP and browser acquisition. Limited/unreadable pages remain visible as coverage issues rather than being called complete.
- Final live run: 889 listing cards, 150 product detail requests, zero detail failures. One empty listing made the run partial. After re-evaluation, the dashboard displayed 82 distinct recent personal offers (84 criterion/offer matches across 977 tracked offers).

## Practical limits

Strict matching can produce fewer personal results when the source omits sizes or gender. General promotions remain available for exploration, with no claim that they fit the shopper. Historical product groups were not destructively split, and old observations were not rewritten. Real-site extraction remains dependent on the source's markup, availability and access rules.

The crawler deliberately reports bounded listing coverage as incomplete. It does not claim exhaustive catalogue discovery. A crash between a successful Telegram request and saving its receipt can still cause a duplicate; the delivery guarantee remains at least once.

The running development services received the changes through hot reload. A process-tree restart was blocked by automatic approval review, so the new explicit loopback binding will apply on the next normal launch; the existing listener was left running.

## Personal promotion feeds

Home discoveries, promotions and clearance now default to the shopper profile. Explicit incompatible gender, unavailable required sizes, unknown fashion gender and excluded brands are filtered before the display limit. General goods stay eligible. `scope=all` is an explicit catalogue/gift view; filters and tabs preserve it.

Makeup can be excluded independently of gender via the editable profile checkbox. This shopper's exclusion is enabled following the relevance feedback; skincare and sunscreen stay visible. A budget badge alone no longer qualifies a clearance offer as “Pour vous”. Live verification: women's denim appears in the general catalogue but not the default feed; clearance displays 132 eligible offers after the makeup exclusion, with no women’s fashion or makeup in the checked rendered cards.

Validation: full isolated-database regression suite passed (148 tests); the additional makeup preference case passed in the focused 15-test profile suite. Final workspace typecheck passed after the preference addition.
