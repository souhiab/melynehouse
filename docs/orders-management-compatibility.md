# Orders compatibility follow-up — 2026-10-30

## Git integration audit

- Started from `feature/order-management-sidebar` at `17825d3`; created `feature/orders-management-compatibility` without rewriting history.
- `03d9462` (frontend/backend integration), `f307d53` (product editor), and `4e3e1cd` (safe variant lifecycle) are all ancestors of this branch. No merge or cherry-pick was needed; no missing commit or conflicting branch was found.
- The existing uncommitted favicon work in `AGENTS.md`, `index.html`, and `public/favicon.svg` was preserved and deliberately excluded from the Orders commit.

## Compatibility changes

- Existing `new` orders display as **Pending / قيد الانتظار**; the new `no_response` state displays as **No Response / لا يرد**. Allowed transitions: Pending → Confirmed, No Response, or Cancelled; No Response → Confirmed or Cancelled. Other transitions retain the established inventory-safe policy. The database check constraint now includes `no_response`.
- Owner order sources now include Website, WhatsApp, Instagram, Facebook, TikTok, Phone, and Other. The latter is retained for historical compatibility. The database check constraint and server validation agree with the form.
- New order-item snapshots include both the original and display product names. The list prioritizes the original snapshot and falls back to the older display-name snapshot. Existing snapshots are not rewritten from today's catalog, because that would misrepresent historical naming.
- Order thumbnails use a variant image when linked, otherwise the first active product image. Missing or broken image URLs render a neutral icon. Item name, option labels, quantity, unit price, and order date remain visible even after product archival and variant retirement.
- Manual orders still call the same `createOrder` transaction as website checkout. A durable `created_by_admin` flag distinguishes them even when the selected source is Website. They are always marked Sheet-sync `disabled`; the retry endpoint rejects them, including older manual orders backfilled from their audit entries. No Sheet request was made in this work.
- The pre-existing Orders and Products sidebar parents retain separate navigation and chevron buttons. Customers, Payments, and Invoices remain disabled and labelled as planned, not operational.

## Migration and data safety

- Backed up the local `melyne_dev` PostgreSQL database before migration at `var/backups/melyne-2026-10-30T17-37-20-944Z.dump` (ignored/private; contains order data). The first backup attempt failed because `pg_dump` was not on `PATH`; retrying with the installed PostgreSQL 17 `bin` directory succeeded.
- Applied `server/sql/007_order_management_compatibility.sql` only to `127.0.0.1/melyne_dev`. It adds `orders.created_by_admin`, backfills it from `create_manual_order` audit entries, and extends status/source constraints. The migration is repeatable and does not delete orders, variants, images, or stock movements.
- `npm run db:verify` passed after migration: PostgreSQL 17.11, 34 products, 468 variants, 207 images, and 468 checked variant/image associations; featured order remained present. The local database currently contains 2 banners, including the original published seed; this task did not change them.
- PostgreSQL integration tests use disposable schemas and verify the main database's product/order counts remain unchanged.

## Validation

- `npm run check`: passed catalog validation, 12 admin tests, 17 storefront/UI tests, 4 Sites tests, and production build. The build retains a non-failing large-chunk advisory. Initial run failed because pg-mem did not support a correlated migration update; changed the backfill to an equivalent uncorrelated `IN` query, then reran successfully.
- `npm run test:order-management:postgres`: 2/2 passed on real local PostgreSQL. Covers owner auth/CSRF, sources including TikTok and Phone, status transitions, stock reservation/restoration, idempotent retry and cross-channel key rejection, archived/retired history, original-name snapshots, thumbnail fallback, migration backfill, and no Sheet calls.
- `npm run test:orders:postgres`: 8 scenarios passed, including rollback, concurrent final-stock orders, idempotency, and cancellation. Its intentional transaction-failure test logs a database exception while passing.
- `npm run test:lifecycle:postgres`: passed retired-variant order/stock history test.
- Local API health and `/owner/orders` route returned HTTP 200. A headless browser rendered the protected owner login screen; authenticated Orders/sidebar visual interaction was **not** browser-verified in this pass. Navigation route/state behavior is covered by existing tests and code inspection.

## Remaining limitations

- Orders created before original-name snapshots were introduced retain only their then-stored display name. Their historical original name cannot be reconstructed reliably from a possibly edited catalog.
- Customers, Payments, and Invoices have no backend workflows yet. Order-list search/filter and legal invoices remain out of scope.
- The owner should visually confirm the authenticated Orders page and sidebar on desktop/mobile before production use. No deployment or GitHub push occurred.
