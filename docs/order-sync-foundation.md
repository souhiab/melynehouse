# Reliable order synchronization foundation — Phase 1

Date: 2026-11-16, Africa/Casablanca. Local implementation on `feature/order-sync-foundation`. This supersedes the implementation gaps in the [baseline audit](google-sheets-order-sync-audit.md). **The client's real Google Sheet remains disconnected. This is not production acceptance.**

## Implemented behavior

New website orders commit the order, saved items/prices, inventory reservation, idempotency claim and one immutable `melyne.cod_order.created` event in the same PostgreSQL transaction. Checkout returns its existing order ID/number/amount/sync-state confirmation without any external network call. Replaying a checkout key returns the existing order and creates no additional event or inventory deduction.

Every new website order records its event even while delivery is disabled. The order's compatibility `sheet_sync_status` remains `disabled` until an enabled worker processes its event. Migration 009 does **not** create events for existing orders. Owner-created manual orders also do not enqueue events. No old order is reconstructed for retry.

The event has a stable event UUID, order UUID/reference, schema version 1, original database creation timestamp, initial status `new`, source `website`, required customer details, optional note, MAD amounts, and every saved item with its own item UUID, original/display product name, optional SKU, variant selections, quantity and saved unit price. Future order snapshots capture SKU; missing historical SKU stays missing. Catalog changes and later order status edits cannot change the payload. PostgreSQL triggers protect the payload/identity and prevent event deletion; delivered records are frozen.

## Files and migration

| File | Purpose |
| --- | --- |
| `server/sql/009_order_sheet_outbox.sql` | New outbox/attempt tables, constraints, due/lease indexes, immutable-event trigger. No changes to existing catalog rows or order statuses. |
| `server/order-service.mjs` | Capture item IDs and optional SKU, enqueue website event in the existing transaction. Existing locks, availability checks, stock reservation, idempotency hash, order numbers and cancellation logic remain. |
| `server/sheet-event.mjs` | Versioned creation payload and strict acknowledgement-field verification. |
| `server/sheet-outbox.mjs` | Atomic claims, lease recovery, fenced completion, retry scheduling, safe owner requeue and protected status projection. |
| `server/sheet-sync.mjs` | HMAC transport, approved endpoint enforcement, bounded retry delay and signed acknowledgement verification. Replaces the mutable synchronous sender. |
| `server/sheet-receiver-contract.mjs` | Framework-independent signed receiver contract with injected persistence adapter. **No production Google adapter is included.** |
| `server/sheet-mapping.mjs` | Explicit approved-column mapping for one row/order or one row/item, preserving all item details. Produces literal string/number cell values, never formulas. No default Sheet columns/tab/ranges. |
| `server/scripts/sheet-sync-worker.mjs` | Separate local worker process with once/continuous modes and graceful signal shutdown. |
| `server/scripts/sync-orders-to-sheets.mjs`, `package.json` | Compatibility once CLI and worker/test commands. No startup with `npm run dev`. |
| `server/config.mjs`, `.env.example` | Disabled-by-default feature flag and endpoint restrictions; no real credentials added. |
| `server/app.mjs` | Removes checkout network wait; owner order detail returns private outbox status; retry queues only an eligible existing failed event. |
| `src/admin/OrdersDashboard.jsx` | Existing detail drawer shows Arabic pending/retrying/delivered/failed/disabled state, attempt count, next retry, safe error and receipt/time; eligible retry uses the same queue. |
| `tests/sheet-outbox-postgres.test.mjs` | Real local PostgreSQL isolation and synthetic receiver/worker acceptance. |
| `tests/admin-workflows.test.mjs` | Checkout test now verifies event creation with zero network calls rather than synchronous webhook success. |
| `tests/admin-test-helpers.mjs`, `tests/admin-migration.test.mjs`, `scripts/qa-admin-preview.mjs` | Explicit pg-mem emulation skips only the unsupported PL/pgSQL trigger block. Real PostgreSQL suites apply and test that block. |
| `docs/admin-setup.md`, `docs/admin-data-model.md` | Updated operating instructions/model. |

Migration 009 was applied directly to **local `melyne_dev` only**, after backup `var/backups/melyne-2026-11-16T15-53-41-833Z.dump`. The ignored validation command was `node --env-file=.env var/apply-outbox-migration.mjs`, which checks loopback/database name, applies only 009, and compares whole-record fingerprints of existing tables. The backup contains private data and must not be committed/shared. A restore was not exercised in this phase.

Before/after fingerprints matched: **35 products, 483 variants, 210 image records, 1 existing order, 1 existing item and 0 existing stock movements**. There were **0 outbox events** after migration, proving no historical backfill. The original extraction snapshot validated by `npm run check` still contains 34 products/468 variants/207 images; PostgreSQL includes the separately imported new product. No catalog data was replaced.

## Worker, retries and recovery

```text
Customer → existing checkout API → PostgreSQL transaction
                                   ├ order + snapshots
                                   ├ stock + idempotency
                                   └ immutable creation event
               ← order confirmation after commit

Separate worker → claim due event → signed receiver request
                      ↓                 ↓
                 lease/attempt     durable deduplication + persistence
                      ↓                 ↓
                 retry/backoff ← verified signed acknowledgement
```

Queue states are `pending`, `processing`, `delivered`, `failed`. A single PostgreSQL claim statement locks due work using `FOR UPDATE SKIP LOCKED`, sets a random claim token and increments the attempt number. Each event has a 60-second lease, longer than the 8-second request/body timeout. Expired claims are recovered on the next worker pass; abandoned attempts become `lease_expired`. Completion checks both token and live lease so an older worker cannot overwrite a newer result. No network call holds order/inventory transaction locks.

Retryable 408/429/5xx/network errors reschedule with exponential delays starting at 30 seconds and capped at one hour. Valid `Retry-After` seconds/HTTP dates on 429/503 extend the wait, capped at 24 hours. After eight attempts the event fails for review. 401/403, other non-retryable 4xx, invalid response signatures and invalid acknowledgements fail immediately. A protected owner retry adds a fresh eight-attempt budget, retaining event ID/payload and all previous diagnostics. Pending/processing/delivered events cannot be manually requeued. Attempts record count, timestamps, HTTP status and fixed error codes; raw URLs, response bodies, exceptions and customer content are not logged.

Delayed/failed work does not occupy a due slot or block newer orders. Multiple workers claim different events under normal operation. Under a stalled process/lease expiry, duplicate network delivery is still possible; destination idempotency is therefore required. A worker database error stops with a generic message; durable leases/events remain recoverable on restart. No Redis or external queue was added.

Owner detail status is behind existing session authentication. Requeue retains CSRF protection and an audit entry. No public endpoint exposes the event payload or customer information. Attempt history is available in the database; the drawer displays sufficient last-attempt diagnostics without a new dashboard page. Status does not live-refresh continuously; reopen/reload the detail to see worker progress.

## Receiver and acknowledgement contract

The sender signs the exact JSON body with `x-melyne-signature: sha256=<HMAC-SHA256>`. The receiver validates it before parsing private fields, limits body size and validates schema version/source/status/item structure. Its persistence adapter must deduplicate **both order UUID and event UUID**, reject changed payloads for an existing identity and serialize concurrent writes.

After durable persistence/read-back, the receiver must return a JSON receipt shaped as:

```json
{
  "schemaVersion": 1,
  "eventId": "<same-event-uuid>",
  "orderId": "<same-order-uuid>",
  "result": "persisted",
  "receiptId": "<stable-destination-receipt>",
  "persistedAt": "<original-ISO-time>"
}
```

Repeated delivery returns `already_persisted` with the same stable receipt and persistence timestamp. The exact response body is signed in `x-melyne-receipt-signature` using the shared server secret. The sender rejects mismatched IDs, malformed receipts and unsigned/wrongly signed 200 responses. It stores only validated receipt fields, not arbitrary receiver content.

**A signed receipt proves that the configured receiver acknowledged this contract; it is not independent proof that a Google Sheet row exists.** The real receiver must implement actual Google read/write verification before it may issue that acknowledgement. The tests use a synthetic PostgreSQL receiver table with a uniqueness constraint and transaction; they do not prove Google atomicity. A Google implementation must survive write-success/ack-loss and receiver restart by checking stable destination keys before writing again, including under concurrent requests. Do not substitute a separate “deduplication log insert” followed by an unprotected append: that still has a crash gap. A stale event or changed status must not overwrite a staff-managed row on a duplicate.

## Mapping and status ownership

`mapSheetEvent(event, {columns, mode})` requires approved header/field mappings and explicit `order` or `items` mode. No operational spreadsheet ID, tab, header order, protected range or formula layout is guessed. One-row mode can map an all-item summary; item-row mode retains stable item IDs, each color/size/quantity/price, and emits the order total on only the first item row to avoid silently multiplying totals. Final representation and totals policy must match the actual Sheet before activation.

Customer/product text is returned as Google-compatible `userEnteredValue.stringValue`, with numbers as `numberValue`; there is no `formulaValue`. A future Google adapter must use literal typed `UpdateCells` requests (or explicitly RAW equivalent), preserve leading phone zeros/plus signs and never reinterpret user text through `USER_ENTERED`. It must preserve existing formulas and approved ranges.

Synchronization is **creation only, one way**. Dashboard changes never update staff-managed Sheet statuses and Sheet statuses are never imported. Creation payloads stay `new` even if the website order is subsequently confirmed or cancelled. Cancellation still restores local inventory under existing rules, but it sends no status update and does not mutate the creation event. Consequently staff can see an initially Pending Sheet order even after local cancellation, including cancellation before eventual delivery. This requires an explicitly approved reconciliation/contact workflow before production use; it must not silently fulfil cancelled orders or overwrite staff statuses. Manual-order sync and historical backfill remain separately scoped decisions.

## Local commands and default safety

The website remains at `http://localhost:5173`, API on loopback port 8788. Worker delivery is disabled unless **all** required settings are explicitly configured:

```dotenv
SHEET_SYNC_ENABLED=false
GOOGLE_SHEETS_WEBHOOK_URL=
GOOGLE_SHEETS_WEBHOOK_SECRET=
SHEET_SYNC_ALLOWED_ORIGIN=
SHEET_SYNC_ALLOW_LOOPBACK_MOCK=false
```

Enabled non-mock endpoints must be HTTPS with an exact approved origin; credentials in the URL, fragments and redirects are rejected. Only non-production with `SHEET_SYNC_ALLOW_LOOPBACK_MOCK=true` may use a loopback HTTP synthetic receiver. That switch is ignored in production. Google credentials remain absent. No feature flag or real destination was enabled locally.

```powershell
npm run orders:sync-sheets       # at most one due event, safely exits if disabled
npm run orders:sync-worker       # separate worker, safely exits if disabled
npm run test:sheet-outbox:postgres
npm run test:orders:postgres
npm run test:order-management:postgres
npm run test:lifecycle:postgres
npm run check
```

The outbox test sets only child-process synthetic receiver configuration. The actual project's `.env` is not rewritten. `npm run orders:sync-sheets` was executed with normal local configuration and printed `Sheet worker disabled; no delivery attempted`.

## Validation results

- `npm run test:sheet-outbox:postgres`: **PASS, 13 scenarios plus parent (14 reported tests)**. Real PostgreSQL disposable schema, synthetic customers/orders and mocked receiver persistence. Covers atomic commit/rollback, concurrent checkout keys, all-item snapshots, immutable historical values/initial status, signed receipt matching, arbitrary 200 rejection, concurrent first receiver writes, duplicate delivery, lost acknowledgement, backoff/429, 401/403/500/503/timeouts, concurrent claims, expired/stale leases, bounded attempts, owner auth/CSRF/requeue, disabled/manual policy and literal mapping.
- The same suite starts **actual Node worker subprocesses** against a loopback HTTP synthetic receiver, restarts them and verifies delivery. A new worker also recovers an injected abandoned/expired claim. This validates process restart/lease recovery; it is not a live server/database restart or Google acceptance.
- `npm run test:orders:postgres`: **PASS, eight scenarios plus parent**, including final-item concurrency, same-key concurrency, rollback and stock restoration once. Its intentional trigger exception is expected test output.
- `npm run test:order-management:postgres`: **PASS, two tests** for manual orders, sources, protected APIs and historical details.
- `npm run test:lifecycle:postgres`: **PASS, one test** for retired variants and historical inventory/order retention.
- `npm run check`: **PASS** after correcting the pg-mem migration-test setup. It validates the original extraction snapshot, 12 admin tests, 27 storefront/owner utility tests, four Sites tests and production build. pg-mem skips the PostgreSQL-only immutability trigger; real PostgreSQL tests validate it. The existing Vite chunk-size warning remains.
- All PostgreSQL suites use disposable schemas and remove them on completion. The new suite compares fingerprints of existing main catalog/order/inventory/outbox records before and after, not merely counts. No real customer order or operational Google row was created.

No full browser walkthrough of the new sync states was performed; API integration and compiled React behavior are the evidence for the small detail-drawer addition. No claim of end-to-end Google verification is made.

## Phase 2 requirements and remaining risks

Before any real connection, obtain and verify:

1. The **existing** spreadsheet ID, exact worksheet/tab and intended receiver deployment/ownership. No replacement operational Sheet.
2. Exact column headers/order, required cells, formulas, protected ranges, date/time convention, phone text format and multi-item representation. Approve any optional stable-ID column or additional tab before changing structure.
3. Stable order/event/item key placement and a duplicate-safe Google persistence strategy. Implement approved range writes, lookup/read-back and durable receipts; test both initial and duplicate rows after receiver restart.
4. Authorized server-side Google credentials, minimum scopes and sharing limited to the intended Sheet. Secrets belong outside Git, with a rotation plan. No Google permissions were changed here.
5. Approved HTTPS receiver URL/origin, secret configuration, process supervision, backups and access controls. Restrict retry operations and receiver access, and retain safe diagnostics.
6. An approved staging/disposable Sheet and acceptance tests for mapping, formulas, multi-item totals, 401/429/outages, duplicate events, concurrent receivers, write-success/ack-loss, process restarts, real authorized write **and read-back**.
7. Monitoring/reconciliation for oldest pending age, failed/expired jobs, verified receipts, missing/duplicate destination IDs and staff status divergence. No real reconciliation API exists yet.
8. Explicit ownership policy for local cancellation versus staff-managed Sheet status, employee communication and fulfilment decisions.
9. A rollout cutoff. Events recorded while the worker is disabled will become eligible if it is later enabled; review that pending population before activation. Existing pre-009 orders are not queued. Any historical backfill or manual-order syncing requires its own approved policy and duplicate review.

The real Google adapter/permissions/mapping and staging acceptance remain outstanding. This foundation and mock contract are ready for local review; **dual-saving into the client's Sheet is not active or production-ready**. No deployment, GitHub push, live order change, Google Sheet write or reverse sync occurred.
