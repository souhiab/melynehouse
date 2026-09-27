# MELYNE storefront and secure owner dashboard

A responsive Arabic RTL rebuild plus an authenticated owner dashboard. PostgreSQL is the source of truth for products, explicit ordering, banners and COD orders. The work remains local/staging and does not deploy to the live store.

## Run locally

This workstation is configured with the local PostgreSQL 17.11 Windows service `postgresql-x64-17-melyne`. Local credentials are ignored by Git.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`; the protected dashboard is at `http://localhost:5173/owner`. Read the local owner login from `var/local-secrets/owner-login.txt`. To verify the real local database or run all regression checks:

```powershell
npm run db:verify
npm run db:acceptance:verify
npm run check
```

The production client is written to `dist/client`. The build also creates the lightweight SPA fallback files used by the included hosting worker. Nothing in this project deploys or modifies the live store.

## What is included

- Homepage based on the supplied desktop composition, adapted for tablet and mobile.
- Arabic RTL catalog and category listings with search, attribute filters, availability filtering, and sorting.
- Product pages with ordered galleries, exact public option labels, variant-level availability, and disabled unavailable combinations.
- Persistent wishlist and cart using browser `localStorage`.
- A clearly labelled prototype checkout that records local/staging COD orders in PostgreSQL. It does not process payment, notify customers, or accept live-store orders.
- Public contact, privacy, exchange, and payment/security pages preserved from the live store.
- Dynamic page titles/descriptions and product JSON-LD generated from verified catalog data.
- Keyboard focus states, semantic form labels, reduced-motion handling, and responsive tap targets.

## Catalog and media

- `data/products.json` — 34 deduplicated products, 468 variants, exact public option labels, ordered images, availability evidence, stable IDs, canonical URLs, and extraction date.
- `data/store.json` — public categories, brand, services, contacts, social links, and policy content.
- `data/crawl-log.json` — pages and endpoints visited during extraction.
- `inventory-report.md` — reconciliation, failures, missing fields, and conflicts.
- `public/images/products` — 207 originals plus 207 web-sized copies.
- `public/images/reference` — the supplied homepage reference plus exact hero/category crops and optimized web copies requested by the store owner.
- `scripts/scrape-catalog.mjs` — repeatable public-catalog extractor with pacing. Running it refreshes the saved snapshot from the current public store.
- `scripts/validate-catalog.mjs` — verifies IDs, canonical URLs, category totals, variant references, and every saved image path.

The saved snapshot was extracted on 2026-09-26. Re-run the scraper only when an intentional catalog refresh is wanted, then review the diff and inventory report before publishing any update.

## Owner dashboard

The protected `/owner` pages manage products, variant availability, uploads and image order, independent category/featured ordering, scheduled desktop/mobile banners, and COD order/sheet-sync status. Public APIs expose only published catalog/banner data. COD submissions are revalidated and priced by the server; Google Sheets receives only an optional signed copy of orders.

Data-model, security, migration, backup and staging instructions are in `docs/admin-data-model.md`, `docs/catalog-migration-report.md`, and `docs/admin-setup.md`.

See `manual-confirmation.md` for source conflicts and decisions that require store-owner access.
