# MELYNE frontend–backend integration audit

Date: 2026-10-28. Scope: local React/Vite storefront, Express API, PostgreSQL 17.11, and owner dashboard. No production site or Google Sheet was accessed or changed. Browser-rendered QA was unavailable because the computer-use surface returned no browser; “verified” below means API/database or automated test evidence, **not** a browser walkthrough.

## Assessment

**Partially integrated, not a fully operational commerce system.** PostgreSQL is the authoritative local source for published products, variants, prices, stock, banners, and prototype COD orders. Authenticated owner mutations use Express and PostgreSQL. Cart, wishlist, unsent Buy Now selection, and sidebar preference are intentionally browser-local. Contact details, policies, category artwork, and WhatsApp destination come from `data/store.json` and static assets, so the owner cannot update them in the dashboard. Local orders are not the owner's real Google Sheets workflow, and local stock is **not** synchronized with real inventory.

```text
data/products.json --one-time import--> PostgreSQL products / variants / images
                                         |                  ^
                                         v                  | authenticated + CSRF owner edits
React storefront <-- GET /api/public/storefront -- Express -- owner dashboard
      |                                              |
      +-- cart/wishlist: localStorage                 +-- uploads: var/uploads + DB references
      +-- Buy Now: sessionStorage                     +-- prototype COD orders: PostgreSQL
      +-- POST /api/orders --> server validation --> locked stock decrement + order transaction
      +-- contact/policies/WhatsApp: data/store.json  +-- optional Sheet webhook: not configured locally
```

## Feature matrix

“API+PG” is isolated-schema or rollback-protected real PostgreSQL testing; “API test” may use pg-mem. A blank browser column is not implied by these checks.

| Feature | Frontend | API | Database | End-to-end verified | Status |
|---|---|---|---|---|---|
| Homepage products and featured order | `src/App.jsx` | `/api/public/storefront` | products, variants, product categories | API+PG catalog check | Connected and verified |
| Banners | `Hero`, owner Banners | public/admin banner routes | banners | API tests; no browser | Connected but not fully tested |
| Categories and ordering | catalog and owner ordering | public catalog, admin reorder | categories, product_categories | API tests; no browser | Connected but not fully tested |
| Search, filters, sort | catalog view | full catalog response | underlying product records | frontend unit coverage only | Frontend-only by design |
| Product details, prices, options, gallery | product page | public catalog | products, variants, images | API+PG, purchase/color tests | Connected but not fully tested |
| Availability and stock | product/cart/checkout views | order validation | product_variants | real-PG order tests | Connected and verified |
| Cart, wishlist, Buy Now selection | browser state | order submission only | none until order | purchase tests; no browser | Frontend-only by design |
| Prototype COD checkout | checkout form | `/api/orders` | orders, order_items, stock_movements | real-PG order tests | Connected but not fully tested |
| WhatsApp enquiry | product and floating links | none | none | URL/message unit tests | Frontend-only by design |
| Contact and policies | footer/pages | none | `data/store.json` | source inspected only | Frontend-only by design |
| Owner authentication | login/session | admin session routes, CSRF | admin_users, admin_sessions | API tests; unauthenticated local API returned 401 | Connected and verified |
| Product create/edit/draft/publish/archive/restore | owner editor/list | admin product routes | products and related rows | real-PG isolated workflow + API tests | Connected but not fully tested |
| Images and color associations | owner gallery | upload/image/color routes | upload_assets, product_images, variant image IDs | API+PG tests | Connected but not fully tested |
| Variants, stock and prices | owner editor | product validation/save | product_variants | API+PG tests; all 34 loaded products validate | Connected but not fully tested |
| Product statistics | owner Products | admin/public catalog | derived from records | unit/API tests | Connected and verified |
| Order statistics | dashboard/analytics | admin orders summary | aggregate over all orders | API test; no browser | Connected but not fully tested |
| Owner order list/status | Orders view | admin order routes | orders, stock_movements | real-PG cancellation test | Connected but not fully tested |
| Order item details | none | no admin item-detail route | order_items exist | no | Not implemented |
| Collections management | read-only counts and product assignment | category membership on product save | categories | product API tests | Partially connected |
| Brands/suppliers/tags | product fields; read-only overview | product save/load | product metadata columns | real-PG editor test | Partially connected |
| SEO fields | editor and client-side document metadata | product save/load | SEO columns | API test; crawler rendering untested | Partially connected |
| Weight/dimensions | owner editor | product save/load | nullable columns | real-PG editor test | Connected but not fully tested |
| Shipping fees/real payment | prototype-only message | no calculator/payment route | none | no | Not implemented |
| Store settings | disabled navigation item | none | none | no | Not implemented |
| Google Sheet copy | sync status UI and optional server webhook | optional sheet-sync service | status fields on orders | mocked webhook test only; local URL absent | Mock/demo |

## Confirmed findings and action

1. **P1 — Variant-option mismatch accepted.** `server/validation.mjs` previously checked duplicate selections but not whether each selection belonged to a defined option/value. A crafted owner API request could create a variant the storefront could not select. Added server validation and a regression test. The audit also found three imported products with significant trailing spaces in option labels; the old parser silently trimmed labels on save, breaking their variant matches. Labels now remain exact. A read-only validation of all 34 current PostgreSQL products returned zero invalid products. No catalog row was rewritten.
2. **P2 — Public catalog could be stale after owner edits.** `server/app.mjs` sent `max-age=30, stale-while-revalidate=60`, while `src/App.jsx` fetched only at mount. Changed the public response and fetch to `no-store`; the storefront refetches when its tab regains focus/visibility. API header test passed. Browser timing remains unverified.
3. **P2 — Dashboard order totals stopped at 500.** `/api/admin/orders` intentionally lists the newest 500, but dashboard/analytics called that list “all orders.” Added a database-wide aggregate summary to the protected response and updated the cards; the list now states how many of the total are shown. The response is still not paginated.
4. **P2 — Selected variant could display a false discount.** A null variant comparison price fell back to the base-product comparison price, possibly showing a struck-through amount below the selected price. Price rendering now takes both values from the selected variant; regression test added.
5. **P3 — Misleading storefront labels.** A visible “My Account” button actually opened Contact; it now says Contact. The checkout summary called a product-only amount the “total” while shipping was uncalculated; it now explicitly says products excluding delivery. No shipping price or payment behavior was invented.
6. **P1 — Removing historically ordered variants is not safely supported.** `server/catalog-repository.mjs` deletes variants omitted from a product edit, while `server/sql/003_order_inventory.sql` restricts deletion of variants referenced by stock movements. An owner changing option combinations after an order can hit a database conflict and fail the whole edit. A versioned archive/retire-variant design and owner workflow are needed; no destructive schema change was made in this audit.
7. **P2 — Owner data failure can leave stale panels visible.** `src/admin/AdminApp.jsx` retains the previous `data` after a failed reload and displays an error. Mutations still validate on the server, but a stale product/order view is possible. A loading/stale-state design and per-section retry are recommended; not changed without browser validation.
8. **P2 — Static business content and unfinished back office.** `data/store.json` owns contact, WhatsApp, and policy copy; category imagery is static in `src/App.jsx`. Collections, brands, suppliers, and store settings are not full CRUD systems. Shipping charges, payment, order-item drill-down, and real inventory/Sheet synchronization need separate owner decisions and backend work.
9. **P2 — SEO is client-rendered.** Product title, description, and JSON-LD are set in a React effect. API values persist, but crawler rendering and canonical URL behavior were not tested; server-rendered metadata would require a separate SEO/hosting decision.

## Validation and limits

- Local API `/api/health` returned PostgreSQL `ok`; public catalog returned 34 products, 8 featured products, 1 active banner, 3 categories. Unauthenticated `/api/admin/products` returned 401. After the API restart, `/api/public/storefront` returned `Cache-Control: no-store`.
- `npm run db:verify` passed against local PostgreSQL: 34 products, 468 variants, 207 images, 468 checked variant/image associations, featured order, and migrations 001–004.
- `npm run check` passed catalog validation, admin/purchase/UI/Sites tests, and build. `node --env-file=.env --test tests/product-editor-postgres.test.mjs` and `npm run test:orders:postgres` passed with isolated schemas/rollback. The intentional transaction-failure stack trace in the order suite is expected and its subtest passed.
- No migration or main-database inventory mutation was performed, so no new backup was needed. Existing uploaded media and catalog rows were preserved. The optional Google Sheets webhook is not configured locally; no Sheet request was made.
- Browser UI tests, keyboard walkthrough, focus/visibility refresh timing, mobile layout, and actual screenshot comparison remain **unverified** because no browser surface was exposed. Automated/HTTP checks must not be read as visual acceptance.

## Next steps

1. Design recoverable retirement of ordered variants and test edit-after-order without losing history.
2. Add paginated order items/details and a clear stale-data/retry state in the owner UI.
3. Decide which static policies/contact/category content the owner should edit, then add only those storage/API paths.
4. Define shipping, payment, and real inventory synchronization with the owner before accepting real orders.
5. Run browser QA of owner create/edit and storefront purchase flows at desktop and mobile widths before deployment.
