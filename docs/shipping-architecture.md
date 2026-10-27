# Proposed MELYNE shipping architecture — planning only

Date: 2026-10-27. This document proposes a later implementation phase. No shipping tables, fees, migrations, carrier integrations, or checkout behavior were changed for this plan. Store-owner decisions are required before any rates or service areas are entered.

## Existing baseline

- Checkout already asks for full name, phone, city and street address. It has a free-text order note, but no dedicated additional-address field, method selector, shipping quote, or pre-confirmation shipping total. The summary says delivery is confirmed when ordering. [Checkout form](../src/App.jsx#L306), [summary](../src/App.jsx#L267).
- `orders` stores MAD subtotal/total and a private customer JSON object, but has no shipping fee, method, zone, address snapshot, tracking number, or payment-collection status. `order_items` store product/variant snapshots. [Schema](../server/sql/001_initial.sql#L115).
- The current status values are `new`, `confirmed`, `preparing`, `shipped`, `delivered`, `cancelled`; the owner can change status manually. There is no status-transition rule, stock reservation/decrement, shipping configuration API, or carrier integration. [Order status schema](../server/sql/001_initial.sql#L118), [status API](../server/app.mjs#L126), [owner orders table](../src/admin/AdminApp.jsx#L408).
- `data/store.json` includes public delivery copy, not a rate table or operational service-area definition. It must not be used to infer prices. [Store metadata](../data/store.json), [runtime catalog API](../server/app.mjs#L78).

## Decisions needed before implementation

1. Owner-approved list of serviceable cities, aliases/spellings, zones, methods, MAD fees, and whether fees can vary by product/quantity. No default zero-fee fallback.
2. Whether delivery is home delivery only or includes pickup, and what address detail each method requires.
3. The operational point at which stock is reserved or consumed, and how cancellation restores it. The existing local API currently does neither.
4. Who confirms COD orders, how the owner and customer are notified, and what constitutes a shipped/delivered event. No notification promise should appear in the UI until implemented.

## Proposed data model (not migrated)

| Entity | Key fields / constraints | Purpose |
| --- | --- | --- |
| `shipping_zones` | Stable ID, unique code, Arabic display name, `enabled`, timestamps | Owner-defined delivery areas. |
| `shipping_cities` | Stable ID, zone FK, normalized unique city key, Arabic label, aliases, `enabled`; index zone FK | Match checkout city to a configured area without guessing fees. |
| `shipping_methods` | Stable ID, code, Arabic label, `enabled`, address requirements | Select among owner-approved methods. |
| `shipping_rates` | Stable ID, zone FK, method FK, `fee_mad numeric(12,2) CHECK (fee_mad >= 0)`, effective dates, `enabled`; prevent overlapping active rates for the same zone/method | Server-authoritative price schedule and explicit unserviceable areas. |
| Order shipping snapshot | Additive order columns or one-to-one `order_shipping`: city/zone/method labels and IDs, address/additional details, quoted MAD fee, quote/rate version, status timestamps, optional tracking details | Preserve the accepted delivery promise even if rates later change. Historical local orders should remain `shipping_unknown`, not be silently assigned zero. |

Use stable primary/foreign keys, index FK/filter columns used by quote and owner queries, exact `numeric` for money, `timestamptz` for effective windows, and database constraints for nonnegative fees and valid ranges. Add migrations only after reviewing the live local schema and a backup/restore plan; keep them additive so current order snapshots remain readable. These choices reflect the PostgreSQL schema/concurrency guidance, not an applied migration. [Current migration pattern](../server/sql/002_owner_dashboard_hardening.sql), [database transaction helper](../server/db.mjs#L7).

## Backend quote and checkout contract

1. Owner configures and publishes a city/zone, method and rate. Only enabled, currently effective combinations are quoteable. Unknown or disabled cities/methods return a clear **not serviceable** response; never silently use MAD 0.
2. Checkout collects name, phone, city, delivery address, optional additional address details and—only if multiple methods exist—a shipping method. A read-only quote endpoint returns fee, currency MAD, method/zone labels, product subtotal and final total, with rate version or quote token. Display this before the confirmation action.
3. On `POST /api/orders`, the server resolves the city/method again, checks the quote version (or rejects with a fresh quote if changed), recalculates product subtotal and shipping fee from PostgreSQL, verifies availability, and persists order, items and shipping snapshot atomically. Client-sent fee/total are never authoritative. Keep external notifications outside the database transaction.
4. An order status transition should be explicit and auditable: `new` (pending confirmation) → `confirmed` → `preparing` → `shipped` → `delivered`, with controlled cancellation paths. Do not rename existing `new` rows to `pending_confirmation` without a reviewed data migration. Inventory reserve/decrement and cancellation release must be designed together, with concurrency and retry protection.

The owner dashboard should expose zones/cities/methods/rates with validation and publish controls, plus an order detail page showing items, address, shipping fee/method, history, and (when available) tracking fields. Customer details remain behind admin authentication; rate-management routes require the same session/CSRF controls as current admin mutations. [Admin guard](../server/app.mjs#L74), [current owner tabs](../src/admin/AdminApp.jsx#L443).

## Phased implementation and acceptance

1. **Design and review:** obtain owner-approved service areas/rates/methods and decide COD/stock lifecycle. Review data migration and backup strategy. Stop if rates or serviceability rules remain unknown.
2. **Additive backend phase:** migrations, constraints/indexes, authenticated rate-management APIs, quote endpoint, server-authoritative order total/shipping snapshot, concurrency-safe inventory handling and idempotency. No carrier API.
3. **Owner/customer UI:** rate editor, order detail/status history, checkout address/method/quote/changed-quote states, mobile RTL and keyboard QA. Keep local/demo wording until an actual operational launch is approved.
4. **Verification:** test configured city, alias, unconfigured city, disabled zone/method, expired/changed rate, zero-fee rate explicitly configured by owner, multiple methods, unavailable variant, concurrent last-unit orders, duplicate submit, cancellation restock, historical order display, authenticated rate edits, backup/restore and API restart. Confirm final total equals server product subtotal plus the exact shipping snapshot fee.

Shipping implementation and any external delivery-company integration require separate authorization. Nothing here deploys or connects the live MELYNE store.
