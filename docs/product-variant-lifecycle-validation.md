# Product and variant lifecycle validation — 2026-10-28

## Prior failure mode

The product editor regenerated size/color combinations. `saveProduct` then deleted variants omitted from the editor payload. `order_items.variant_id` has an `ON DELETE SET NULL` foreign key, while `stock_movements.variant_id` restricts deletion. Thus an edit could fail after a stock movement, or delete an unreferenced stable variant ID. Archiving a whole product was already recoverable and kept order snapshots.

## Change

Migration `005_variant_retirement.sql` adds nullable `product_variants.retired_at`; no product or variant rows are removed. The owner may retire a variant explicitly or by removing an option combination. Retired variants remain in PostgreSQL with their identifiers, stock, image association, order references and stock movements. The public catalog omits them. Reactivating the same combination reuses its ID and begins unavailable until the owner explicitly enables it. Existing combinations cannot be recreated under new IDs, or changed in place to a different combination. An owner confirmation describes the effect of retirement. The owner editor distinguishes temporarily unavailable, unknown stock, zero stock, retired, and active/available states. Existing imported option labels are preserved when editing comma-separated values.

Orders recheck `retired_at IS NULL` inside the same parent-product/variant-locking transaction used for stock deduction. Cancellation can restore stock to a retired variant without re-enabling its purchase. Buy Now and saved-cart checks also reject retired selections; the database remains authoritative.

## Local validation

- Created a recoverable local database dump before migration: `var/backups/melyne-2026-10-28T14-39-15-084Z.dump` (ignored, private; do not publish).
- `npm run db:migrate`: applied migrations 001–005 to local `melyne_dev`.
- `npm run test:lifecycle:postgres`: passed against a disposable schema in local PostgreSQL 17.11. Tested an order, variant retirement by omission, public exclusion, owner visibility, failed duplicate-combination creation, failed purchase, retained order snapshot/reference and stock movement, cancellation/restock while retired, same-ID reactivation unavailable, successful purchase only after explicit availability, product archive/restore, and unchanged main-database counts after cleanup.
- `npm run test:orders:postgres`: 8 scenarios passed, including stock-concurrency, idempotency, rollback and cancellation from the prior inventory phase.
- `node --env-file=.env --test tests/product-editor-postgres.test.mjs`: 2 tests passed.
- `npm run check`: catalog validation, admin tests, purchase/owner tests, Sites tests, and production build passed. Vite reported only the existing >500 kB chunk-size advisory.
- `npm run db:verify`: passed with 34 products, 468 variants, 207 images and 468 checked variant/image associations. Featured order and seeded banner validated.
- Restarted the local API and loaded `/api/public/storefront`: 34 published products, 3 categories, 1 active banner, 468 public variants. The local main catalog was not modified by lifecycle tests.

No production database, real customer records, Google Sheet, deployment, or GitHub push was touched. No browser surface was available in this environment, so owner-form visuals, live React interaction, and browser refresh behavior were **not** visually verified; the API persistence and UI logic were tested programmatically.
