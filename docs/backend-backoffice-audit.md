# MELYNE House has a working local backend, but not a production order operation

Audit date: 2026-10-27. Scope: repository inspection, read-only queries against the configured local PostgreSQL database, and unauthenticated HTTP `GET` checks. No customer record, credential value, or order payload was read or changed. No browser walkthrough, write-path test, penetration test, backup restore, or production environment was verified in this audit.

## Executive summary

- MELYNE is **full-stack locally**, not frontend-only: React/Vite calls a Node.js/Express API backed by PostgreSQL. The live local database has 34 products, 468 variants, 207 product-image records, 2 banners, and 1 previously recorded test order. The two migrations are applied. [Frontend bootstrap](../src/main.jsx#L1), [API entry](../server/index.mjs#L1), [database pool](../server/db.mjs#L1), [migrations](../server/sql/001_initial.sql#L1).
- Checkout is server-backed and persists local COD orders with server-derived prices and a unique order number. It does **not** reserve or decrement inventory, notify the owner/customer, or operate against the live store. The existing checkout labels it as local/demo. [Order handler](../server/app.mjs#L80), [checkout UI](../src/App.jsx#L286), [database schema](../server/sql/001_initial.sql#L115).
- `/owner` has functional product, image, banner, ordering, and basic order-status tools; protected API routes require a session and CSRF token. Its order table does not show order items or provide fulfillment tracking. [Dashboard](../src/admin/AdminApp.jsx#L303), [order table](../src/admin/AdminApp.jsx#L408), [API guard](../server/app.mjs#L74).
- There is **no verified production deployment** for the API, database, uploads, or operations. The included Sites worker serves static files only; its configuration has no database or object-storage binding. [Worker](../worker/index.js#L1), [hosting config](../.openai/hosting.json), [server listener](../server/index.mjs#L8).

**Decision:** keep checkout explicitly local/demo and do not send real customers to this build until the P0/P1 work below is completed and tested on a secured staging stack.

## 1. Current architecture

```text
Browser: React 19 + Vite 6, Arabic RTL storefront and /owner
  ├─ localStorage: cart and wishlist; sessionStorage: Buy Now selection
  ├─ bundled data/store.json: brand, contact, policies, fallback categories
  └─ /api and /media (Vite development proxy)
       └─ Node.js / Express 5 API on 127.0.0.1:8788
            ├─ pg pool → local PostgreSQL 17.11 (catalog, banners, admins, orders)
            ├─ persistent local upload directory → /media
            └─ optional signed Google Sheets order copy (disabled locally)

data/products.json → explicit one-time catalog import → PostgreSQL
Sites worker/build → static SPA fallback only; no API or PostgreSQL connection
```

The frontend uses React client-side routing, selecting `AdminApp` for `/owner`; Vite proxies `/api` and `/media` in development. The API is a separate Express process, not a Next.js route or a hosted backend service. [package.json](../package.json#L31), [src/main.jsx](../src/main.jsx#L1), [vite.config.mjs](../vite.config.mjs#L4), [server/index.mjs](../server/index.mjs#L1). `DATABASE_URL`, admin/session settings, upload paths, allowed origins, and optional Sheet webhook are server-side configuration names; `.env` and `var/` are Git-ignored. Values were not included in this report. [server/config.mjs](../server/config.mjs#L6), [.env.example](../.env.example#L1), [.gitignore](../.gitignore#L1).

The authoritative runtime catalog is PostgreSQL: `GET /api/public/storefront` queries `loadProducts`, banners, and categories. `data/products.json` is an import snapshot, **not** the product source read by the running storefront. `data/store.json` remains the bundled source for brand/contact/policy text and fallback category data; changing it requires a frontend rebuild. [server/app.mjs](../server/app.mjs#L78), [server/catalog-repository.mjs](../server/catalog-repository.mjs#L6), [server/import-catalog.mjs](../server/import-catalog.mjs#L5), [src/App.jsx](../src/App.jsx#L8), [src/App.jsx](../src/App.jsx#L350).

## 2. Database structure, inventory, images, and data flow

The configured local engine reported PostgreSQL **17.11**, with migrations `001_initial` and `002_owner_dashboard_hardening` present. A read-only schema/count query found all 13 expected public-schema tables:

| Tables | Stored purpose | Evidence |
| --- | --- | --- |
| `schema_migrations` | Applied migration versions | [001_initial.sql:3](../server/sql/001_initial.sql#L3), [002_owner_dashboard_hardening.sql](../server/sql/002_owner_dashboard_hardening.sql) |
| `admin_users`, `admin_sessions`, `admin_audit_log` | Owner identity, hashed sessions/CSRF, admin actions | [001_initial.sql:8](../server/sql/001_initial.sql#L8), [002_owner_dashboard_hardening.sql](../server/sql/002_owner_dashboard_hardening.sql) |
| `categories`, `products`, `product_categories` | Category membership, names, MAD prices, publication, option definitions, ordering | [001_initial.sql:26](../server/sql/001_initial.sql#L26), [002_owner_dashboard_hardening.sql](../server/sql/002_owner_dashboard_hardening.sql) |
| `product_variants`, `product_images`, `upload_assets` | Option selections, per-variant price/stock/availability/image ID, ordered media metadata and uploads | [001_initial.sql:63](../server/sql/001_initial.sql#L63), [002_owner_dashboard_hardening.sql](../server/sql/002_owner_dashboard_hardening.sql) |
| `banners` | Arabic copy, desktop/mobile image URLs, publication window and order | [001_initial.sql:96](../server/sql/001_initial.sql#L96) |
| `orders`, `order_items` | Private COD customer JSON, totals/status/Sheet sync and immutable line-item snapshots | [001_initial.sql:115](../server/sql/001_initial.sql#L115) |

Observed local counts: 34 products, 3 categories, 34 product-category links, 468 variants, 207 product images, 2 banners, 1 upload asset, 1 order, and 1 order item. This is a point-in-time **local** read, not evidence of live-store data. The order's status was `confirmed`, with Sheet synchronization `disabled`; no customer fields were queried. Of 468 variants, 167 had positive stock and were marked available, 299 had zero stock, and 2 had `NULL`/unknown stock. These figures do not prove that inventory is synchronized with the real MELYNE store. [Variant schema](../server/sql/001_initial.sql#L81), [order schema](../server/sql/001_initial.sql#L115), [local verification script](../scripts/verify-local-postgres.mjs#L1).

Products belong to categories through `product_categories`; variants and images each belong to a product, while a variant may reference an image ID. The API builds product JSON by joining these rows and orders images by `sort_position,id`. Original imported images and optimized copies are files under `public/images/products`; the database stores paths/URLs and metadata, **not image bytes**. Owner uploads are files under `MELYNE_UPLOAD_ROOT`, exposed through `/media`, with asset metadata/checksums in PostgreSQL. [Repository mapping](../server/catalog-repository.mjs#L14), [image schema](../server/sql/001_initial.sql#L63), [upload handler](../server/app.mjs#L45), [static media route](../server/app.mjs#L68), [README catalog section](../README.md#L31).

Inventory is represented by `product_variants.stock_quantity` and `available`, plus product-level availability. The owner can edit these values and the order API checks them, but there is no reservation, decrement, stock-movement history, or cancellation replenishment. The order handler only reads a variant row and inserts an order; the status handler only updates `orders.status`. [Variant model](../server/sql/001_initial.sql#L81), [order handler](../server/app.mjs#L80), [status handler](../server/app.mjs#L126).

There is no separate `customers` or `payments` table. Customer name/phone/city/address are stored inside private `orders.customer` JSONB; COD is represented by the checkout choice and order data, but there is no paid/unpaid ledger. Order-item snapshots preserve product/variant details if the catalog later changes. [Order schema](../server/sql/001_initial.sql#L115), [checkout form](../src/App.jsx#L306), [order inserts](../server/app.mjs#L81).

Migrations and manual backup commands exist. `db:migrate` runs SQL files; `db:backup` uses `pg_dump`, and `uploads:backup` copies files with a SHA-256 manifest. Documentation proposes a schedule and restore steps, but this repository does not establish an automated schedule, encrypted storage, offsite retention, or a current successful restore drill. [Migration runner](../server/scripts/migrate.mjs#L1), [DB backup](../server/scripts/backup-database.mjs#L1), [upload backup](../server/backup-uploads.mjs#L30), [setup guidance](../docs/admin-setup.md#L64).

## 3. Owner dashboard feature matrix

“Fully implemented” below means the local UI and API/data model support the described capability; it does **not** mean production acceptance or browser visual QA was completed in this audit.

| Capability | Assessment | Evidence / limit |
| --- | --- | --- |
| Create/edit products, names, categories, descriptions, MAD prices | Fully implemented locally | [ProductEditor](../src/admin/AdminApp.jsx#L123), [saveProduct](../server/catalog-repository.mjs#L42), [API](../server/app.mjs#L89) |
| Set comparison price / simple displayed discount | Partially implemented | Comparison prices are stored/displayed; no promotion engine, coupon or discount rules. [Editor](../src/admin/AdminApp.jsx#L224), [schema](../server/sql/001_initial.sql#L43) |
| Hide/archive/restore products | Fully implemented locally | Statuses and recoverable archival; no hard-delete UI. Restore endpoint exists, but the dashboard uses status editing rather than a dedicated restore button. [Dashboard](../src/admin/AdminApp.jsx#L303), [API](../server/app.mjs#L92) |
| Upload/replace/preview/reorder images; associate colors | Fully implemented locally | Stable image IDs, variant image picker and extra-gallery color assignment. [ImageManager](../src/admin/AdminApp.jsx#L250), [API](../server/app.mjs#L96) |
| Manage size/color options and variants | Fully implemented locally | Variant combinations, prices, stock, availability, and image association. [ProductEditor](../src/admin/AdminApp.jsx#L97), [variant table](../src/admin/AdminApp.jsx#L234) |
| Set category/featured order and manage banners | Fully implemented locally | Explicit order and banner publish/archive/upload/date controls. [OrderingPanel](../src/admin/AdminApp.jsx#L322), [BannersPanel](../src/admin/AdminApp.jsx#L349), [API](../server/app.mjs#L118) |
| View/update stock; mark variants unavailable | Partially implemented | Manual fields and UI; no stock ledger, reservations or external stock sync. [Variant table](../src/admin/AdminApp.jsx#L234), [variant schema](../server/sql/001_initial.sql#L81) |
| Prevent overselling; reduce stock after order | Missing | Request quantity is checked, but no row lock or stock update accompanies order creation. [Order handler](../server/app.mjs#L80) |
| View incoming orders and customer name/phone/city | Partially implemented | Protected table shows up to 500 newest orders, not full detail/history. [OrdersPanel](../src/admin/AdminApp.jsx#L408), [GET endpoint](../server/app.mjs#L125) |
| View ordered products, variants, quantities | Missing in dashboard | `order_items` are saved but not returned by admin orders endpoint or shown in UI. [Schema](../server/sql/001_initial.sql#L131), [endpoint](../server/app.mjs#L125), [UI](../src/admin/AdminApp.jsx#L413) |
| Update status / cancel order | Partially implemented | Status select supports `cancelled`; no transition rules, refund/payment effect or stock restoration. [UI](../src/admin/AdminApp.jsx#L409), [API](../server/app.mjs#L126) |
| Fulfillment/delivery tracking | Partially implemented | `preparing/shipped/delivered` status labels only; no carrier, tracking ID, shipment events or delivery integration. [Schema](../server/sql/001_initial.sql#L118), [UI](../src/admin/AdminApp.jsx#L409) |
| Customer profiles, search/history, enquiries | Missing | No customer table, customer search, order-history view or enquiry inbox. Contact actions are external links. [Schema](../server/sql/001_initial.sql#L115), [dashboard tabs](../src/admin/AdminApp.jsx#L443), [WhatsApp links](../src/App.jsx#L69) |

## 4. Cart, Buy Now, checkout, and orders

The cart and wishlist persist in browser `localStorage`; Buy Now's selected item persists for the tab in `sessionStorage`. They are not customer-account carts and do not synchronize across devices. Add to Cart merges the same product/variant key. Buy Now creates a separate checkout selection, so it does not add to or clear existing cart lines. [Stored-state hook](../src/App.jsx#L25), [cart state/addition](../src/App.jsx#L337), [Buy Now state](../src/App.jsx#L382), [selection helper](../src/purchase.js#L1).

The flow is **product → variant/quantity selection → cart or direct checkout → POST `/api/orders` → local order and items in PostgreSQL → local confirmation number → protected owner order list**. Checkout does not merely draw a fake confirmation: the API inserts the order in a transaction and the UI shows success only after a 201 response. The server validates the submitted customer fields and item IDs/quantity, reloads published product/variant, checks availability and current stock, calculates MAD totals from database prices, and generates a random-suffixed unique order number. Client price fields are not accepted by the strict order schema. [Checkout](../src/App.jsx#L286), [schema](../server/validation.mjs#L45), [server order transaction](../server/app.mjs#L80), [unique order number constraint](../server/sql/001_initial.sql#L115).

This is **local COD order persistence**, not an operating live-order service. No card or online-payment integration is present; the electronic-payment UI is disabled. COD selection does not record actual cash collection. No email/SMS/customer confirmation service exists, and the optional Google Sheet copy is disabled in the local configuration. A Sheet webhook, if configured later, is a signed copy, not the product/order database; retries require the owner endpoint or a manually run script. [Payment UI](../src/App.jsx#L306), [Sheet sync](../server/sheet-sync.mjs#L3), [retry endpoint](../server/app.mjs#L127), [retry script](../server/scripts/sync-orders-to-sheets.mjs#L1).

The checkout warning correctly says that the order is local/demo and is not sent to the real store or a fulfillment/payment service. It must remain until an authorized production workflow is deployed. [Checkout warning](../src/App.jsx#L306), [local-order documentation](../docs/purchase-actions.md#L1). **No order was submitted during this read-only audit.**

## 5. Authentication and security findings

**Implemented protections.** The browser can load `/owner` as a login shell, but admin data calls require a valid PostgreSQL-backed session. Read-only HTTP checks returned 200 for `/owner`, `/api/health`, and `/api/public/storefront`, and 401 for unauthenticated `/api/admin/session`, `/api/admin/products`, and `/api/admin/orders`. The API checks an HTTP-only, `SameSite=Strict` session cookie; production mode marks it `Secure`, and mutations require a header/cookie CSRF token pair tied to the server-side session. Passwords use salted `scrypt`; login and public order submissions are rate-limited. [Auth/CSRF](../server/app.mjs#L74), [login](../server/app.mjs#L83), [hashing/cookies](../server/security.mjs#L6), [rate limits](../server/app.mjs#L80).

The server uses parameterized SQL for user inputs in the reviewed routes/repository, Zod schemas for product/banner/order/login inputs, a nonempty allowlist for browser-origin mutations, and Helmet headers. It does not configure permissive `Access-Control-Allow-Origin`; missing `Origin` is not authentication and public orders are intentionally unauthenticated. Product images have a 10 MB upload limit, JPEG/PNG/WebP magic-byte check, generated filenames, and a public upload directory. Admin APIs hold customer records behind authentication; the public storefront omits orders and customer data. Secrets use server-side environment names and ignored paths, not `VITE_` frontend variables. [SQL and guards](../server/app.mjs#L61), [validation](../server/validation.mjs#L1), [upload checks](../server/app.mjs#L22), [public route](../server/app.mjs#L78), [Git ignore](../.gitignore#L1).

**No confirmed unauthenticated admin-data exposure or critical credential leak was found in this read-only review.** That is not a penetration-test or production-security certification. Specific remaining concerns:

| Priority | Finding | Evidence and implication |
| --- | --- | --- |
| **P0** | Stock can be oversold, including concurrent orders or repeated lines. | The handler checks `stock_quantity` with a plain `SELECT`, then inserts orders/items without locking/reserving/decrementing stock. Duplicate item rows are not coalesced by the order schema. [server/app.mjs:80-81](../server/app.mjs#L80), [orderSchema](../server/validation.mjs#L45) |
| **P1** | Order submissions lack an idempotency key and durable abuse controls. | Retry/double-submit can create distinct orders; the 12/minute rate limit is process-local. Unique order number does not deduplicate requests. [server/app.mjs:80-81](../server/app.mjs#L80) |
| **P1** | Customer privacy operations are not implemented/verified. | PII is stored in `orders.customer` JSONB, but retention/deletion policy enforcement, production DB encryption/access review, and incident procedures are not evidenced. Admin GET returns customer fields to any logged-in owner session. [schema](../server/sql/001_initial.sql#L115), [admin orders](../server/app.mjs#L125) |
| **P2** | No server-side role separation. | `admin_users` has no role field and all valid admin sessions pass the same guard. Adequate for a single-owner local prototype, not delegated staff access. [schema](../server/sql/001_initial.sql#L8), [guard](../server/app.mjs#L74) |
| **P2** | Upload and logging controls need production hardening. | File size/signature checks exist, but no image decoding/pixel limit, malware scan, or orphan-upload cleanup is evidenced. Errors go to `console.error`, without central monitoring or alerting. [upload middleware](../server/app.mjs#L25), [error handler](../server/app.mjs#L129) |

## 6. Production readiness

| Area | Present locally | Not yet verified/implemented for production |
| --- | --- | --- |
| App/API hosting | Express runs on loopback; Vite proxies it for local development. [server/index.mjs](../server/index.mjs#L8), [vite.config.mjs](../vite.config.mjs#L10) | No configured public API host/reverse proxy/HTTPS routing. The Sites worker is static-only. [worker/index.js](../worker/index.js#L1) |
| PostgreSQL | Local Windows service and real migrated schema; read-only counts above. | No managed production database, connection/TLS/access policy, high availability or disaster-recovery proof. [server/db.mjs](../server/db.mjs#L3), [docker-compose.staging.yml](../docker-compose.staging.yml#L1) |
| Media | Imported local files plus persistent owner-upload path; backup commands. | No verified production persistent volume/object storage, CDN, backup schedule or restore test. [server/config.mjs](../server/config.mjs#L7), [server/backup-uploads.mjs](../server/backup-uploads.mjs#L30) |
| Secrets/auth | Production mode requires a 32+ character session secret and explicit origins; admin auth/CSRF exist. | Real production secrets, HTTPS termination, key rotation, role policy and security testing not verified. [server/config.mjs](../server/config.mjs#L12), [server/security.mjs](../server/security.mjs#L24) |
| Orders/operations | Local COD transaction, status edit, optional signed Sheet copy. | Inventory transaction, idempotency, owner/customer notifications, line-item dashboard, delivery workflow, reconciliation and customer-service process absent. [server/app.mjs](../server/app.mjs#L80), [src/admin/AdminApp.jsx](../src/admin/AdminApp.jsx#L408) |
| Reliability/testing | Unit/integration tests, local acceptance scripts, health endpoint, manual backups. [package.json](../package.json#L14), [server/app.mjs](../server/app.mjs#L77) | No verified browser QA in this audit, concurrency/load tests, scheduled backup+restore, monitoring/alerts, or production deployment test. Prior validation documentation describes local PostgreSQL acceptance, not production operation. [docs/admin-validation-report.md](../docs/admin-validation-report.md#L14) |

`docker-compose.staging.yml` runs PostgreSQL only. The Sites build copies a static SPA worker with no database binding (`d1`/`r2` are null); publishing that artifact alone would not make `/api/public/storefront` or checkout operational. The API currently binds `127.0.0.1`; it would need an explicitly designed production network path. [Compose file](../docker-compose.staging.yml#L1), [hosting config](../.openai/hosting.json), [build preparation](../scripts/prepare-sites-build.mjs#L1), [API listener](../server/index.mjs#L8).

## 7. Shipping baseline and future phase

Checkout currently captures city and address, but `orders` has no shipping fee, method, zone or delivery snapshot, and the server total equals the product subtotal. No rate table or shipping quote API exists. A separate [shipping architecture and implementation plan](shipping-architecture.md) proposes owner-configured service areas/rates, a server-calculated quote displayed before confirmation, and an additive migration after owner decisions. No shipping rate was inferred or implemented in this task. [Checkout](../src/App.jsx#L306), [order schema](../server/sql/001_initial.sql#L115), [order calculation](../server/app.mjs#L80).

## 8. Prioritized development roadmap

1. **P0 — Protect order integrity before public checkout:** atomically reserve/decrement per-variant stock in the order transaction (including duplicate-line aggregation), define unknown-stock policy, and make cancellation/restock behavior explicit. Add concurrent-order and replay tests. Keep the local/demo warning until this and an owner handling process are in place. [Current order handler](../server/app.mjs#L80).
2. **P0 — Establish a complete staging deployment:** host Express, PostgreSQL, and persistent media together behind HTTPS with restrictive network access; route `/api` and `/media` from the storefront. Verify migrations, published catalog, checkout, owner login, and rollback there before any public launch. Static Sites output alone is insufficient. [Current worker](../worker/index.js#L1), [config](../server/config.mjs#L6).
3. **P1 — Make orders and shipping operational:** add an idempotency key, durable anti-abuse strategy, owner notification/queue, full order/item detail and search in `/owner`, auditable status transitions, owner-configured delivery zones/rates, a server-calculated shipping total shown before confirmation, fulfillment/tracking fields, and customer confirmation only after a real operational process is approved. Do not infer rates. [Order UI](../src/admin/AdminApp.jsx#L408), [order model](../server/sql/001_initial.sql#L115), [shipping plan](shipping-architecture.md).
4. **P1 — Define privacy and recovery controls:** production DB access/encryption, retention and subject-request procedures, scheduled encrypted/offsite database+media backups, tested restore, and monitoring/alerts for API, order failures, and Sheet sync. [PII model](../server/sql/001_initial.sql#L122), [backup scripts](../server/scripts/backup-database.mjs#L1).
5. **P2 — Harden owner and media operations:** add delegated roles only if multiple staff need access; improve upload validation and orphan cleanup; add central logs/alerting and browser/security/concurrency test coverage. [Admin schema](../server/sql/001_initial.sql#L8), [upload route](../server/app.mjs#L96).
6. **P3 — Optional commerce enhancements:** payment integration, customer accounts/order history, promotion rules, carrier integrations, and self-service enquiries only after the COD foundation is reliable and the owner confirms these requirements. [Current payment UI](../src/App.jsx#L306), [dashboard tabs](../src/admin/AdminApp.jsx#L443).

## Conclusion

**Can MELYNE House currently accept, store, and manage real customer orders securely from checkout through fulfillment? NO.** It can validate and store a COD **test order locally** and show/edit its basic status in a protected owner dashboard. It cannot yet run a verified public checkout-through-fulfillment service: inventory is not consumed safely, order detail and notifications are incomplete, fulfillment and customer confirmation are absent, and no complete production backend deployment has been verified. [Order transaction](../server/app.mjs#L80), [order dashboard](../src/admin/AdminApp.jsx#L408), [static worker](../worker/index.js#L1).
