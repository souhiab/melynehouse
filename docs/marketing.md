# Local Marketing section

## Owner pages

Open `/owner/marketing`. The expandable Marketing navigation follows the existing separate parent/chevron pattern and remains usable in icon-only mode. Cards use MELYNE green/cream, Arabic RTL and a 3/2/1-column responsive grid.

All ten reference modules are represented: Discounts, Upsells, Facebook Pixels, TikTok Pixel, ChatGPT Pixel, Reviews, LinkedIn Pixel, X/Twitter Pixel, Snapchat Pixel and Google Ads. Super admin and products/marketing staff may manage them; confirmation/follow-up staff cannot. Settings APIs require existing authentication and CSRF protection.

## Operational local storefront features

- **Discounts:** one percentage coupon at a time, enabled explicitly. Code accepts letters/numbers/underscore/hyphen; percentage is greater than 0 and at most 100. Checkout quotes from current server-side variant prices and submits the coupon code only. Final totals and stock are revalidated in the existing transaction; subtotal, discount and total are saved separately. Cart and Buy Now share this checkout. Changing the coupon changes the idempotency hash; requests without coupons keep their old hashes. A committed request replays even if the coupon is disabled later. No expiry, minimum order, usage limit, fixed-MAD coupon or coupon stacking in this implementation.
- **Upsells:** select up to 12 published products and enable recommendations. Product pages show up to four selected products, excluding the current product and any no longer present in the public published catalog. These link to the existing product page and variant selection; no automatic cart insertion. The selection applies store-wide, not per source product.
- **Reviews:** enable collection, then customers can submit a display name, rating and plain-text opinion. Submissions are rate-limited and pending by default. Only published reviews appear publicly, and only for published products. Owner moderation offers pending/published/rejected; rejection preserves the record. Disabling reviews hides reviews and prevents new submissions. No fabricated seed reviews or verified-purchase badges. This is moderation, not proof of purchase. Basic IP rate limiting is not a production anti-abuse system.

Settings survive API restarts in PostgreSQL. All storefront features default to disabled. No catalog records, existing customer orders or media were modified to demonstrate them.

## External integrations

Facebook, TikTok, LinkedIn, X, Snapchat and Google Ads pages persist safe identifier strings as inactive setup drafts. Google Ads also saves the conversion label. No arbitrary JavaScript, access tokens or provider credentials are accepted. No external scripts/events or consent workflow are installed. Activation needs verified account settings, consent handling and event tests in a separate phase.

“ChatGPT Pixel” is included as an explicitly unavailable setup item matching the screenshot. There is no verified integration specification configured for this project; no fake pixel or operational connection is offered.

## Database and order integrity

Migration `013_marketing.sql` adds `marketing_settings`, moderated `product_reviews`, and nullable order coupon code plus a zero-default discount amount. A recoverable local PostgreSQL backup was created before applying only this migration to verified loopback `melyne_dev`. Older migration replay limitations remain documented separately.

Coupon configuration is read with a shared lock during order submission. Invalid coupons roll back stock and request claims. Original item unit prices remain intact; order-level totals reflect the discount. Existing creation outbox payloads remain unchanged for orders without discounts. Discounted events contain accurate subtotal/total and additive discount metadata. No real Sheet synchronization was invoked or changed.

## Validation

- `npm run check` passed: catalog validation (34 imported reference products, 468 variants, 207 original/optimized images), existing admin tests, frontend/order-contact tests, Sites tests and build.
- Real PostgreSQL tests: `node --env-file=.env --test tests/marketing-postgres.test.mjs tests/order-postgres.test.mjs tests/team-postgres.test.mjs tests/variant-lifecycle-postgres.test.mjs` — 15 passed, none skipped. Each integration suite uses a disposable schema and checks public product/order counts before and after cleanup. The intentional rollback-trigger error in the order suite is expected and its test passed.
- Marketing tests cover role/CSRF protection, rejected script IDs, unsupported module handling, persistent config, coupon quote/price snapshots, invalid-coupon rollback, idempotency after disabling a coupon, concurrent discounted purchases of the final item, published-only recommendations and moderated review visibility.
- Browser visual/interaction QA is unverified if the installed computer-use runtime cannot start. Build/API checks are not visual verification. No deployment or GitHub push.

Main files: `src/admin/MarketingPanel.jsx`, `marketing-modules.js`, `ReviewModeration.jsx`, `owner-navigation.js`, `AdminApp.jsx`, `admin.css`; `src/StoreMarketing.jsx`, `src/App.jsx`, `src/styles.css`; `server/marketing.mjs`, `app.mjs`, `team.mjs`, `validation.mjs`, `order-service.mjs`, `order-list.mjs`, SQL migration 013; marketing and owner-navigation tests.
