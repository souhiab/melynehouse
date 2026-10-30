# MELYNE Orders dashboard redesign — local validation (2026-10-30)

## Layout assessment

The attached brief, existing owner dashboard, and MELYNE green/cream tokens guided the redesign. Storeino was not accessed or copied. The desktop table has **exactly six columns in right-to-left visual order**: المنتج, المقاس, اللون, تاريخ الطلب, السعر, حالة الطلب. The product is the rightmost column. The header, Add New Order action, five compact count cards, search/date/status/source controls, table, and pagination remain visually distinct.

Headless Chrome screenshots of the actual Orders React component and CSS were captured with **isolated sample orders** (no real customer details). The two photographed items use their associated local catalog images; the retired-item fixture uses the missing-image fallback. These are component-layout screenshots, not an authenticated live-session capture:

- [Desktop, 1440 px](qa-orders/orders-desktop-1440.png): six columns fit without horizontal scrolling; compact thumbnails, saved MAD totals, and color-coded statuses remain readable.
- [Tablet, 768 px](qa-orders/orders-tablet-768.png): the full table remains available through horizontal scrolling; the status column is initially off-screen rather than silently removed.
- [Mobile, 504 px](qa-orders/orders-mobile-504.png): table switches to cards; product, date, saved total, and status stay visible. The fifth count card occupies its own final row.
- [Desktop detail drawer](qa-orders/order-detail-desktop-1440.png) and [mobile detail drawer](qa-orders/order-detail-mobile-504.png): all items, customer fields, source/date, line totals, saved totals, notes, and status history fit without horizontal clipping.

This environment's Chrome CLI enforces a 504 px minimum CSS viewport; a 390 px screenshot request produced a **cropped 504 px viewport**, so it was rejected as mobile evidence. Browser automation surfaces were unavailable, and remote-debugging capture did not connect. Therefore actual 390 px layout and authenticated click/focus interactions still need a manual browser pass; they are **not marked visually passed**. The protected `/owner/orders` route displayed the owner login screen, as expected.

## Implementation

- Added a new Orders page with server-backed search (order number, customer text, and historical product snapshot), status/source filters, Moroccan-calendar date range, newest/oldest date sorting, filtered pagination, and unfiltered real status-count cards. The existing New Order button navigates to the existing manual-order form.
- Product rows show the first saved item with a real thumbnail or fallback, original snapshot name when available, order number, quantity and extra-item count. The table uses saved size/color labels, creation date, authoritative order total, colored status badge, and a protected status selector. The mobile view uses order cards instead of hiding critical fields.
- Clicking a row opens a keyboard-accessible detail drawer. It fetches every saved item through the authenticated API, including retired variants; shows each line's quantity, unit price and calculated line total; and displays saved subtotal/final total, customer information, source, notes, and recorded status changes. Escape/backdrop/close button dismiss it. Older snapshots fall back to their stored display name; no historical name is reconstructed from the current catalog.
- The status selector is fixed in this sequence: Pending, No Response, Confirmed, Preparing, Shipped, Delivered, Cancelled. It does not alphabetize options. Invalid transitions stay disabled; the Express transaction remains the authority. Cancelling requires confirmation and uses the existing single-restoration inventory logic. Orders cannot be deleted.
- Added a protected order-detail endpoint and server-side list filtering. A repeatable migration labels pre-source-tracking orders as `unknown` only when their creation predates migration 006, avoiding a false Website claim; later Website orders are unchanged. No delivery API, shipping request, tracking control, or Sheet operation was added.

## Data safety and tests

- Local database backup before migration: `var/backups/melyne-2026-10-30T18-06-33-687Z.dump` (private and Git-ignored). Migration `008_unknown_order_source.sql` ran only against `127.0.0.1/melyne_dev`.
- `npm run db:verify`: passed on PostgreSQL 17.11 with 34 products, 468 variants, 207 images, and 468 checked variant/image associations. Existing featured order and banners were preserved.
- `npm run check`: passed catalog validation, admin tests, storefront/UI tests (including three new Orders view-model tests), Sites tests, and build. The non-failing Vite large-chunk advisory remains.
- `npm run test:order-management:postgres`: passed in a disposable real-PostgreSQL schema. It covers protected list/detail endpoints, status/source/date/search filters and validation, sorting, real counts, status-history persistence, multiple-item saved totals, image fallback, historical archived/retired items, legacy unknown source backfill, inventory-safe cancellation, and no delete endpoint. An initial test assumed item order rather than the established stable-ID order; the assertion was corrected to test the same two saved sizes irrespective of order, then rerun successfully.
- `npm run test:orders:postgres`: all eight inventory/idempotency/rollback/concurrency/cancellation scenarios passed. `npm run test:lifecycle:postgres`: retired-variant history test passed. These tests use disposable schemas; they do not mutate the main catalog or customer orders.
- The running local `/owner/orders` preview returned HTTP 200, `/api/health` reported PostgreSQL healthy, and unauthenticated `/api/admin/orders` returned HTTP 401.
- No GitHub push, deployment, production website change, delivery integration, or real Google Sheet modification occurred.

## Remaining limitations

- True 390 px and authenticated end-to-end browser interaction QA require a browser surface capable of owner login and viewport emulation. The available CLI only rendered the isolated component fixtures and protected login screen.
- Older order snapshots may lack `originalName`; their saved `displayName` is displayed instead. Status history begins with changes recorded in `admin_audit_log`; older events cannot be invented.
- Internal notes are displayed where saved, but there is no separate notes-edit workflow. Customer, Payments, and Invoices sections remain planned rather than operational.
