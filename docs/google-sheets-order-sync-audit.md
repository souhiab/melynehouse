# Website orders and Google Sheets synchronization audit

Date: 2026-11-16 (Africa/Casablanca). Scope: current local React/Express/PostgreSQL project. Branch: `feature/orders-dashboard-redesign`. Existing uncommitted work was preserved. This audit adds documentation and isolated tests; application logic and configuration were not changed.

Historical baseline: the later authorized [Phase 1 foundation](order-sync-foundation.md) supersedes the implementation findings below. Its isolated outbox suite replaces the original temporary audit test. The real Google connection remains disabled and unverified.

## Business answer and verdict

**NOT READY for dual-saving.** In the inspected local configuration, a successful website checkout saves the order to PostgreSQL and makes it available through the authenticated owner Orders API. It does **not** write to the client's operational Google Sheet: the webhook URL and secret are empty. The optional integration is **C — exists but is disabled**. Its transport has a passing mock test, but the destination Sheet, receiver, mapping, permissions and actual Google write are not verified.

Enabling the current webhook alone would not establish reliable, duplicate-safe delivery. Production configuration and the live website were not inspected; this finding describes this repository and local environment, not the existing live site's order workflow.

## Direct answers to the ten questions

| Question | Answer and evidence |
| --- | --- |
| 1. Website orders saved to PostgreSQL? | **YES, locally.** `server/app.mjs` POST `/api/orders` calls `createOrder`; `server/order-service.mjs` commits orders, snapshots, inventory movements and the idempotency claim in `server/db.mjs:transaction`. Real PostgreSQL tests passed. |
| 2. Orders appear in the owner dashboard? | **YES, implemented and API-tested.** `server/order-list.mjs:listAdminOrders/getAdminOrder` supplies the protected endpoints consumed by `src/admin/OrdersDashboard.jsx`. Authenticated disposable-data tests verify saved items/customer/totals in list and detail responses. No new real-customer order or browser checkout was performed in this audit. |
| 3. Automatically written into the existing client Sheet today? | **NO in the local environment.** Both webhook settings are empty; the single existing local order has sync status `disabled`. No destination spreadsheet/tab is configured or identified. Production behavior is unknown. |
| 4. Is the integration enabled and working? | Disabled locally. If configured, a new website order triggers `syncOrderToSheet` **after commit but before the checkout response**. An owner retry endpoint or explicitly run CLI can also call it. Only mocked webhook acceptance has been verified. |
| 5. Guaranteed recoverable delivery without duplicate rows? | **NO.** `pending/failed` flags persist and support explicit recovery, but there is no running worker, automatic retry schedule, claim/lease, remote receipt validation or verified receiver deduplication. Resending a synced order is allowed. Lost acknowledgements can cause duplicate remote writes. |
| 6. Mapping matches the operational Sheet? | **NOT VERIFIED.** No Sheet ID, tab, header schema, receiver source, permissions or authorized destination access is available in the project. Source is absent from the webhook payload; SKU is not captured in order snapshots. |
| 7. Status synchronization? | No automatic status synchronization or reverse sync. Dashboard status changes only update PostgreSQL/history/inventory. An explicit resync sends the **current** status under the original `melyne.cod_order.created` event, so a receiver could overwrite a staff-managed Sheet status. |
| 8. Missing access/configuration/approval? | Intended existing spreadsheet and tab, read-only structure review, receiver deployment/source, approved field mapping, stable ID strategy, restricted Google authorization, webhook secret/URL, retry ownership, status conflict policy and authorized staging validation. |
| 9. Required code changes? | Durable outbox and worker, idempotent receiver, verified acknowledgement, approved mapping, historical SKU/source enrichment where appropriate, sync monitoring/reconciliation and isolated failure tests. Precise plan below. |
| 10. Safe to activate dual-saving today? | **NOT READY.** PostgreSQL order handling is verified; delivery into the actual operational Sheet is disabled, unmapped and lacks verified duplicate protection. |

## Inspected implementation and local evidence

### Checkout, persistence and dashboard

1. `src/App.jsx:CheckoutPage/submitOrder` handles both regular cart checkout and Buy Now. A ref blocks concurrent button submissions. A SHA-256 fingerprint and UUID are kept in session storage so an uncertain retry can reuse the same `Idempotency-Key`; customer fields themselves are not saved in that retry record. Client state is cleared on success. Separate tabs/new keys can still create separate orders; idempotency protects the same request key, not arbitrary matching customer details.
2. `server/app.mjs` validates the UUID header and parses `server/validation.mjs:orderSchema`. Customer name/phone/city/address are required; note is optional; each line has product/variant IDs and integer quantity. Phone validation here is length-based, not a full international-number validator. The public route fixes the source to `website`.
3. `server/order-service.mjs:combineOrderLines/createOrder` combines duplicate product/variant lines, claims/locks a durable idempotency key, checks the normalized request hash, locks products and variants, verifies publication/availability/retirement and known stock, and conditionally decrements inventory. Unknown stock is rejected. Server variant prices determine totals using integer cents.
4. One PostgreSQL transaction stores `orders`, `order_items`, `order_requests`, and `stock_movements`. All roll back together on failure. There is no Google request while these inventory locks are held. PostgreSQL is authoritative, and retries with the same key replay the original order without another deduction.
5. `orders` contains UUID, unique `MLY-YYYYMMDD-<hex>` order number, status, MAD subtotal/total, private customer JSON, note, source, manual-origin flag, inventory state, timestamps and Sheet status/error/synced timestamp. `order_items` stores quantity, historical unit price and product/variant JSON snapshots. Product snapshots contain ID, original/display name; variant snapshots contain ID/name/exact selections. They do **not** currently snapshot SKU. No separate delivery amount exists; current total is the products subtotal.
6. `server/order-list.mjs` uses saved snapshots and prices for history; joins images when available. Authenticated list/detail endpoints serve filters, pagination, counts and history to `src/admin/OrdersDashboard.jsx`. `server/app.mjs` protects admin routes with session authentication and mutation CSRF checks. The running local `/api/health` returned PostgreSQL OK and unauthenticated `/api/admin/orders` returned 401.
7. Manual owner orders use POST `/api/admin/orders`, `manualOrderSchema` and the same `createOrder` service with `{manual:true}`. Source values include website, WhatsApp, Instagram, Facebook, TikTok, Phone and Other; legacy unknown is supported. Manual orders intentionally get `disabled` and cannot use the owner retry-Sheet endpoint. Source `website` does not override that manual-origin restriction.
8. `changeOrderStatus` locks the order, enforces existing transitions and restores reserved stock once on eligible cancellation, recording audit and stock movements. It does not call Sheets. Retired variants and historical order snapshots remain readable; no order deletion was introduced.

### Google implementation: actual call paths

- `server/config.mjs` reads only `GOOGLE_SHEETS_WEBHOOK_URL` and `GOOGLE_SHEETS_WEBHOOK_SECRET`; a URL without a secret fails configuration validation. There is no direct Google API client, service-account/OAuth implementation, Sheet ID/tab setting, or receiver code in tracked project files. `.env.example`, setup docs and `.gitignore` confirm intended local disablement and ignored local secrets.
- `createOrder` atomically sets `sheet_sync_status='pending'` when a website order is created with a configured URL, otherwise `disabled`. This is a durable recovery marker, **not a separate immutable sync job**.
- `server/app.mjs` returns immediately for an idempotent replay. For a newly committed website order it **awaits** `syncOrderToSheet`. Thus an enabled integration can add up to the configured 8-second network timeout to checkout, plus database time.
- `server/sheet-sync.mjs:syncOrderToSheet` queries the saved order/items, creates JSON event `melyne.cod_order.created`, HMAC-SHA256 signs the exact body and sends it in `x-melyne-signature`. It treats **any HTTP 2xx** as success without parsing a receipt or checking a spreadsheet row. It records `synced` or `failed` and a truncated error. Here `synced` means the webhook returned 2xx; it does not prove Google persisted an order.
- The public order payload includes stable order UUID/reference, timestamps, customer, note, amounts and saved line snapshots; it omits `orders.source`, `created_by_admin` and item SKU. The payload is freshly reconstructed on each attempt, so status can change between attempts.
- `server/scripts/sync-orders-to-sheets.mjs`, invoked by `npm run orders:sync-sheets`, selects up to 100 `pending/failed` orders, oldest first, and sends them sequentially. It is a one-off CLI, with no recurring scheduler, backoff or concurrency claim. There is no startup recovery hook in `server/index.mjs`. Permanently failing oldest entries can repeatedly occupy the batch and delay newer work.
- POST `/api/admin/orders/:id/retry-sheet-sync` requires owner session/CSRF, rejects manual orders and resets status before resending. It can resend an already synced order; there is no synced guard or lease. The owner detail drawer displays sync state and offers a button for failed non-manual orders, not pending/disabled backlogs. Error details are available privately in the API; there is no operational retry queue view.

### Configuration verified without exposing values

Read-only inspection using `node --env-file=.env var/audit-sheet-config.mjs` verified local PostgreSQL 17.11 at loopback, database `melyne_dev`, migrations 001–008, and empty webhook URL/secret. The only matching Google/Sheet process variable names were those two settings, both unconfigured. One existing non-admin local order was `disabled`. No names, phones, addresses, passwords, tokens or secret values were output.

The actual production configuration, any off-repository webhook implementation and any separately configured OS/service scheduler are **unknown**. No tracked scheduler/workflow for this sync was found. There was no reason to contact a connected Google account or search private spreadsheets without an identifiable intended destination; no Google Sheet was read or modified.

## Operational spreadsheet and proposed field mapping

The actual Sheet columns, formulas, required cells, tab names, status labels, unique reference field and multi-item convention are **all unknown**. Whether staff manually create/edit rows is a business requirement described in the brief, not independently verified Sheet evidence. The table below is a mapping proposal for review, not a claim that these columns exist.

| Required data | Authoritative saved website field | Current transport / proposed handling |
| --- | --- | --- |
| Unique ID/reference | `orders.id`, `order_number` | Both sent. Use UUID as machine deduplication key and retain MLY reference for staff. Reuse an existing suitable column; adding a hidden/optional column requires approval. |
| Date/time | `orders.created_at` | Sent. Agree Africa/Casablanca display/time format and preserve the original instant. |
| Full name | `orders.customer.name` | Sent; map to verified name column. |
| Phone | `orders.customer.phone` | Sent; write as literal text to retain leading zero/`+`. |
| City | `orders.customer.city` | Sent; preserve saved value. |
| Address | `orders.customer.address` | Sent; private operational column only. |
| Product name | `order_items.product_snapshot.originalName/displayName` | Sent; use historical original name or explicitly agreed display format. |
| SKU | Not in current order snapshot | Backend snapshot addition for future orders is needed if SKU is required. Historical missing SKU remains missing; do not substitute today's catalog SKU as historical fact. |
| Color | `variant_snapshot.selections` | Sent; read exact Color/colour/Arabic option labels, retain item association, omit absent fields. |
| Size | `variant_snapshot.selections` | Sent; same rule, no invented options. |
| Quantity | `order_items.quantity` | Sent per line. |
| Product price | `order_items.unit_price_mad` | Historical unit price sent; calculate line total from saved quantity/price only. |
| Total MAD | `orders.total_mad`, `currency` | Sent; current amount excludes an unimplemented delivery charge. Never label delivery as free or copy a guessed fee. |
| Order source | `orders.source` | Stored but **not sent**; mapping/transport adjustment required. Keep original source and manual origin distinct. |
| Status | `orders.status` | Raw value sent; initial Pending is `new`. Agree translation and status ownership before mapping/updating. |
| Customer notes | `orders.customer_note` | Sent as null when absent; map only to an approved column. |

Multi-item transport already includes all items with their own selections, quantities and historical prices. If the existing Sheet uses one order row, use its approved item-summary format without pairing one color/size with every item. If it uses one item per row, preserve the shared order ID and add an approved stable line identifier; the current webhook omits `order_items.id`, so include it in the versioned payload. Do not repeat an order total across rows in a way that inflates existing SUM formulas. An optional separate items tab is only a proposal requiring explicit owner approval; do not create it automatically. Preserve existing column order, formulas and staff-edited cells.

## Reliability and security findings

| Scenario | Current behavior / risk |
| --- | --- |
| Double click/network retry | Ref plus persisted UUID in checkout; durable backend hash/key protects identical retries. Real PostgreSQL concurrent-key tests passed. |
| Sheet 401/429/503 or network error | Order remains committed; sync becomes failed when error handling completes. No automatic retry/backoff or Retry-After handling. |
| Process stops after order commit, before sync | Pending marker remains, but startup does not process it. Explicit CLI recovery is possible when enabled. |
| Remote write succeeds but response is lost | Local status becomes failed or stays pending; retry sends the same order again. Stable ID is included, but receiver deduplication is not implemented/verified here. |
| Two workers/retry clicks race | No lease/claim/lock for sync attempts. Both may send and race local status updates. A late failure could overwrite a success flag. |
| Remote response is 2xx without a row write | Local flag says synced. No parsed durable receipt, row ID or read-back verification. |
| Local status update fails after remote write | The next attempt can send again; no transactional commit spans PostgreSQL and Google. Some errors outside the fetch catch can return 500 after the order already committed; backend idempotency still protects the PostgreSQL retry. |
| Failed checkout response retried with same key | Replayed order returns 200; failed/pending Sheets copy is not retried by that route. |
| Previously disabled orders after enablement | One-off script selects pending/failed only; disabled history is not automatically backfilled. Approve a cutoff and reviewed backfill if wanted. |
| Cancellation/status edits | Safe inventory logic operates locally. No status event is sent. Manual resend includes current status under a created event, creating a possible Sheet conflict. |
| Sheet-to-website updates | No inbound Sheet/order import or reverse status sync exists. |
| Reconciliation | No job compares PostgreSQL IDs against Sheet rows, finds duplicates or verifies missing delivery. |

The HMAC sender keeps its secret server-side; `.env` and `var/` are ignored. No Google credential file is tracked in the inspected file list. This is not a full Git-history secret scan. Receiver authentication/signature verification, replay policy and Google access scopes cannot be audited without receiver code. Configuration currently does not require HTTPS or restrict the webhook destination; production should validate an approved HTTPS endpoint. Raw transport error strings are stored and CLI/server paths can log errors; sanitize these before production so endpoint URLs, tokens or customer data cannot leak. Treat user text as literal spreadsheet cell values to avoid formula execution; the missing receiver's behavior is unverified.

For a future server-managed receiver, use a dedicated identity granted access only to the intended spreadsheet and the smallest workable scopes. Alternatively review the existing authorized receiver's ownership and permissions. Keep credentials in server secret storage, verify signatures before handling private payloads, restrict read/retry operations to the owner, and do not expose order content through public APIs. No Google OAuth consent, sharing changes or writes were attempted in this audit.

## Status and order-source transition policy

Existing presentation order is Pending (`new`), No Response, Confirmed, Preparing, Shipped, Delivered, Cancelled. PostgreSQL enforces transitions; in particular Shipped cannot currently cancel directly and Delivered/Cancelled are terminal. Preserve these rules.

Recommended interim policy: synchronize **new website orders one way**, with an immutable initial status in their delivery event. Let staff continue owning Sheet operational statuses. Do not send dashboard status updates into the same cells or import Sheet statuses until ownership and conflict resolution are agreed. Clearly explain that subsequent local status edits are not mirrored during this interim stage. A cancelled local order may need a deliberate staff notification/reconciliation process; approve that workflow before enabling real orders to avoid fulfillment conflicts.

| Origin | Current support | Recommendation |
| --- | --- | --- |
| Customer website checkout | PostgreSQL plus optional disabled webhook | Required durable one-way delivery into the existing Sheet after staging verification. |
| Owner manual order | Same safe PostgreSQL service, sync explicitly disabled | Offer one-way delivery only after owner approves policy; preserve source and created-by-admin. Review already-entered Sheet orders to prevent duplicating them. |
| Staff order entered directly in Sheet | Not imported | Preserve workflow; no reverse import or two-way sync without a separate approved scope. |

## Tests and preservation evidence

A recoverable local `pg_dump` backup was created before schema-isolated testing: `var/backups/melyne-2026-11-16T15-44-26-647Z.dump`. It contains private local data and remains ignored; do not publish it. Its restore was not exercised during this audit.

| Command | Result / scope |
| --- | --- |
| `node --env-file=.env var/audit-sheet-config.mjs` | Passed read-only local configuration/database checks listed above. |
| `node --env-file=.env --test tests/sheet-sync-audit-postgres.test.mjs` | PASS: nine scenarios plus parent (10 reported tests), real PostgreSQL disposable schema, **mock webhook only**. Covers multiple items, owner-list data, absent note, missing source/SKU, failed delivery and explicit retry, checkout replay, duplicate sync sends, lost acknowledgement, HTTP 401/429, cancellation without push, pending state after a new pool, disabled manual sync and historical snapshots/prices after catalog edits. |
| `npm run test:orders:postgres` | PASS: eight scenarios plus parent (9 reported). Successful/multi/duplicate lines, unavailable/unknown/zero stock, idempotency, rollback, concurrent final item and same-key submissions, safe cancellation and legacy stock. The intentional trigger exception logged during rollback testing is expected. |
| `npm run test:order-management:postgres` | PASS: two tests covering manual order safety, source handling, protected owner listing/detail, filters and historical data. |
| `node --test --test-name-pattern="COD order copy is signed" tests/admin-workflows.test.mjs` | PASS: one test. **pg-mem + mock HTTP**, verifies exact body HMAC and synced flag; not real PostgreSQL or Google acceptance. |
| Local health and unauthenticated Orders GET | PostgreSQL health OK; private Orders endpoint 401. |

All real PostgreSQL suites use unique disposable schemas and check that existing main catalog/order counts remain unchanged. No real customer order was created or edited. No operational Sheet request was made. No runtime file, migration, credentials or feature flags were modified. `npm run check` was not rerun: this task changed documentation and one independently executed audit test, not the application/build; the targeted suites above are the new evidence.

Limits: no actual Google write, read-back, formulas, multi-row mapping, receiver auth, deduplication or status conflicts were tested against a Sheet. Network timeout is represented by a synthetic lost-ack exception, not an actual 8-second outage. Restart coverage recreates a PostgreSQL pool and explicitly invokes sync; it is **not** proof of a worker process recovering automatically or of a database/server restart. Full browser interaction was not repeated in this audit.

## Smallest implementation plan — approval required, not implemented

| Step | Purpose / existing files | Proposed new files / schema | Access, tests and operational risks |
| --- | --- | --- | --- |
| 1. Read-only destination discovery | Review existing `.env.example`, `docs/admin-setup.md`, receiver if it exists. Obtain intended Sheet ID/tab and sanitized header/formula samples through authorized read-only access. | Approved mapping document, no database change. | Requires owner identification of the actual Sheet and authorization to inspect it. Do not guess columns or change tabs. Confirm unique order IDs, multi-item rows, staff status ownership and formula cells. |
| 2. Durable event on order commit | Extend `server/order-service.mjs:createOrder` in the existing transaction. Keep stock/idempotency intact. Version payload with saved source, stable line IDs, snapshots and historical amounts. Add SKU to future product snapshots if needed. | Proposed next migration `009_order_sheet_outbox.sql`: outbox UUID, unique order/event key, immutable JSON payload, state, attempts, next-attempt time, lease, safe last error and receipt. No new order/customer model required. | Test rollback with no orphan job, concurrent requests produce one job, retries keep original event, null optional fields and multi-item snapshots. Historical unknown SKU remains null. Approve handling of disabled historical orders and manual-order policy before enqueueing them. |
| 3. Duplicate-safe receiver and approved mapping | Replace the unverified webhook contract in `server/sheet-sync.mjs` with receipt-aware delivery while reusing signing. Inspect/reuse any real existing receiver first. | Only if absent: owner-controlled receiver implementation with verified HMAC, stable UUID/line-key upsert, concurrent-write serialization, formula-safe text and durable receipt. Optional approved Sheet ID column; no automatic structural changes. | Requires authorized access to the existing Sheet; stage against a separate approved test destination. Test duplicate event, concurrent sends, write success/ack loss, multi-line totals, receiver restart and permission failures. Local outbox alone cannot make remote writes idempotent. |
| 4. Worker and recovery | Remove external wait from `server/app.mjs` checkout; keep customer success dependent on PostgreSQL commit. Refactor `server/scripts/sync-orders-to-sheets.mjs` to drain the outbox. | `server/sheet-outbox.mjs`, `server/scripts/sheet-sync-worker.mjs`, documented local/staging process runner. Uses outbox migration above. | Claim rows with leases/locking; bounded exponential backoff, rate-limit handling, expired-lease recovery and reviewable exhausted jobs. Test process death before send, after remote write and before receipt save. Keep customer checkout independent of Google outages. |
| 5. Owner visibility and safe retry | Extend existing Orders detail in `src/admin/OrdersDashboard.jsx` and protected routes in `server/app.mjs`; reuse order-list API as appropriate. | No duplicate dashboard. Expose pending/retrying/failed/delivered, attempts and safe error, plus authorized retry through the same worker. | Auth/CSRF tests; do not reset a delivered event into a second creation blindly. Review legacy `sheet_sync_status` transition compatibility and accurately label transport vs verified receipt. |
| 6. Reconciliation and ownership policy | Document creation-only sync and explicit staff-owned statuses; protect staff-edited cells. Add receiver-assisted reconciliation of order IDs/receipts. | `server/scripts/reconcile-sheet-orders.mjs` or an equivalent authenticated receiver read API. No inbound order/status write path. | Scoped read permission required. Detect missing IDs and duplicates without auto-deleting rows. Agree actions for cancellations and status divergence before real fulfillment. |
| 7. Approved staged rollout | Update `docs/admin-setup.md`, `.env.example`, test/validation docs; configure production secrets only after separate approval. | Dedicated mock/real-PostgreSQL outbox tests and a small approved staging Sheet acceptance suite. | Test 401/429/503, downtime/restarts, duplicate submit/event, lost ack, mapping, formulas, cancellations and reconciliation. Approve a cutoff/backfill and manual-order sync explicitly. Monitor backlog age, failed jobs and receipts. Do not send production orders before receiver/mapping acceptance. |

These changes are proposed only. PostgreSQL and Google Sheets cannot share an atomic commit; the objective is durable eventual delivery with a verified idempotent destination. Activation, live Sheet changes and implementation await explicit approval.
