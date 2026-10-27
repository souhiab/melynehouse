# Phase 1 — local order and inventory reliability

This phase changes only the local Express/PostgreSQL prototype. It does not deploy the storefront, enable real payment, configure Google Sheets, or add shipping fees.

## Inventory policy

- `product_variants.stock_quantity` is the authoritative count. `NULL` means unverified stock and cannot be ordered. Zero cannot be ordered. Imported values were not rewritten. A product without a stocked variant cannot be ordered.
- Buy Now and cart checkout use the same `POST /api/orders` endpoint. The storefront disables purchase for known zero/unknown stock; PostgreSQL rechecks every order because storefront data may be stale.
- Duplicate lines for the same product and variant are combined before stock validation. Each transaction claims an idempotency key, locks product rows in product-ID order and variant rows in variant-ID order, conditionally updates stock, then inserts the order, order items, and negative stock movements. A failure rolls back all of these writes.
- The request must send a UUID `Idempotency-Key` header. A committed retry with the same normalized request returns the original order (HTTP 200) without another deduction. Reusing the key with different data returns 409. The checkout stores only a request fingerprint and key in session storage so uncertain network retries reuse the key; it never stores customer fields there.
- An owner may move an order through `new → confirmed → preparing → shipped → delivered`. Cancellation is allowed from `new`, `confirmed`, or `preparing`. Shipped, delivered, and cancelled orders cannot be cancelled. Repeating the current status is a no-op.
- Cancellation of a Phase 1 reserved order restores its exact quantities and writes positive stock movements in the same transaction. Repeated or concurrent cancellations cannot restore twice. Older orders default to `not_reserved` and can be cancelled without falsely adding stock that was never deducted.

## Migration and local validation

Migration `server/sql/003_order_inventory.sql` adds nullable idempotency metadata and an inventory state to `orders`, plus `order_requests` and `stock_movements`. It does not alter existing product or media rows. Before applying it, a `pg_dump` custom-format backup was made under the ignored `var/backups/` directory. Do not commit or share that backup; it may contain private local orders.

Commands used locally:

```text
npm run db:backup       # with PostgreSQL 17 bin on PATH
npm run db:migrate
npm run test:orders:postgres
npm run check
npm run db:verify
```

The real-PostgreSQL test creates an isolated `phase1_test_*` schema in the loopback-only `melyne_dev` database, uses dedicated fixture products, then drops that exact schema. It checks that the existing product, variant, image, and order counts are unchanged. The in-memory admin tests are useful regressions but are not counted as PostgreSQL concurrency acceptance.

## Remaining before production

The existing checkout is still explicitly local/prototype. Shipping rates and totals, fulfillment operations, production monitoring/backups, and operational review of imported stock quantities remain separate work. The two imported variants with unknown stock require owner confirmation before they can be sold. Public catalog responses may remain cached briefly after an order, but the server rejects stale selections. No live domain or production database was touched.
