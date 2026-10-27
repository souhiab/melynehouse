# MELYNE House owner dashboard and product editor upgrade

Date: 2026-10-27. Scope: local development only; no production deployment, Storeino access, or Google Sheets changes.

## Completed

- Grouped Arabic RTL right-side navigation. Dashboard, Analytics, Orders, Products, Add Product, Collections, Stock, Brands, Suppliers, Product Ordering, Banners and Store Preview open working views. Store Settings is visibly disabled because no settings subsystem exists. Marketing, Landing Pages, Applications and Affiliate were not added as fake modules. The existing collapsed/sidebar preference and mobile drawer remain.
- Products overview uses real owner/public API data for total, published, draft, visible and variable counts. Search, status/category filters, thumbnail, price, SKU, variant count, archive/restore, editing and 12-item pagination remain operational.
- One existing product editor was reorganized into accordion sections: General (including the existing image manager), Descriptions, Options & Variants, SEO, and Advanced. New products start as drafts. Existing imported names and variant IDs are preserved when options remain unchanged.
- General fields now include private buying cost and supplier, public tags/brand/model/badge, and optional physical measurements. The latter are metadata only and do not calculate shipping.
- Detailed HTML description uses Tiptap for Arabic RTL authoring and a server-side `sanitize-html` allowlist. Public product pages render only sanitized HTML, with original plain description as fallback. Short description, badge, brand, SEO title and meta description are wired to public pages.
- Product gallery can upload multiple files, preview originals, replace, reorder, set the main image, and archive an image after confirmation. Archiving rejects images still assigned to a variant. Files remain in persistent upload storage; stable image IDs survive replacement.
- Sticky save bar has draft and selected-status saves, duplicate-submit guard, backend error/success handling, and cancellation/section navigation warnings for unsaved changes. Save is not reported successful before the API responds.
- The existing MELYNE logo image is linked as the site favicon. The owner editor is lazy-loaded so public shoppers do not download its rich-text editor chunk.

## Database and API

Migration `004_product_editor.sql` adds `draft` to product status and nullable/JSON fields: `short_description`, `cost_price_mad`, `tags`, `brand_name`, `model_name`, `supplier_name`, `badge_text`, `badge_color`, `seo_title`, `meta_description`, `weight_kg`, `width_cm`, `height_cm`, `depth_cm`. Existing rows remain unchanged. Product slug uniqueness is still enforced by PostgreSQL. Published product slugs are read-only in the editor to avoid accidental URL changes.

Owner-only fields (`costPriceMad`, `supplierName`, weight and dimensions) are omitted from the public catalog response. Public products are still only `status='published'`; order submission continues to validate publication, variant availability and verified stock transactionally. Unknown stock is not treated as unlimited. Product images are archived, not physically deleted; historical order snapshots remain intact.

## Validation performed

- Created a local `pg_dump` backup before migration. `pg_dump` was installed at `C:\Program Files\PostgreSQL\17\bin` but not on PATH, so the first backup command failed; rerunning the existing backup script with that directory on the process PATH succeeded. The backup is under ignored `var/backups/` and contains private order data.
- `npm run db:migrate`: migrations 001–004 applied to local PostgreSQL 17.11.
- `npm run db:verify`: 34 products, 468 variants, 207 images, 468 checked variant/image associations; passed with the existing featured order and seeded banner.
- `node --env-file=.env --test tests/product-editor-postgres.test.mjs`: 2/2 passed. A rolled-back draft insert and an isolated-schema owner API workflow tested draft save, image upload, metadata, publication, cost/supplier privacy, image archive and product archive. The main catalog count stayed 34.
- `npm run check`: passed catalog validation, admin/workflow tests, purchase/color tests, Sites tests, and production build. The bundle-size warning remains (owner editor is now separately loaded).
- `npm run test:orders:postgres`: passed all eight real-PostgreSQL order scenarios, including the intentional rollback failure, concurrent final-item orders, idempotent retries, and cancellation restoration.
- `git diff --check`: passed.
- Local web/API listeners were running at ports 5173/8788; public API returned 34 products and one active banner.

Visual browser QA is **blocked**: the available computer-use surface reported no browsers, and the in-app browser could not be opened. Build/HTTP success is not a substitute for checking the rendered desktop/mobile owner UI. The supplied Storeino images were used only as organizational references, not copied as assets or code.

## Deliberately deferred

- Quantity unit/step/minimum/maximum, order-wide free-shipping eligibility, volume and shipping fees: these require corresponding order/checkout policy and server validation. No control claims to enforce them yet.
- Separate CRUD records for brands/suppliers, visitor analytics, store settings, marketing, landing pages, applications, affiliate, and AI generation: no supporting subsystem exists. Brands/suppliers are currently product metadata with read-only overview pages.
- Rich-text image embedding and tables: not enabled until upload ownership, sanitation and rendering rules are designed. Existing gallery images are managed separately.
- The existing rectangular MELYNE logo is used directly as a PNG favicon. Dedicated square 16/32/180px icon assets were not created because no approved square brand mark is in this repository; verify the browser-tab appearance with the owner before producing alternate brand artwork.
- Visual comparison and keyboard interaction of the rendered owner pages require a browser session. Check expanded/collapsed sidebar, long labels, mobile drawer, all editor sections, sticky save bar, rich-text toolbar and image drag/drop before production use.

## Source files

Main changes: `src/admin/AdminApp.jsx`, `src/admin/admin.css`, `src/admin/OwnerViews.jsx`, `src/admin/RichTextEditor.jsx`, `src/admin/product-stats.js`, `src/App.jsx`, `src/styles.css`, `src/main.jsx`, `index.html`, `server/catalog-repository.mjs`, `server/validation.mjs`, `server/product-html.mjs`, `server/app.mjs`, `server/sql/004_product_editor.sql`, tests, package manifests, and `docs/admin-data-model.md`.
