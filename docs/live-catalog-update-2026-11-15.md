# Live catalog update and navigation check — 2026-11-15

## Source comparison

- Public source: https://melynehouse.com/shop and its public product pages.
- Live catalog: 35 distinct products; local PostgreSQL before sync: 34.
- One new product: [🐼 طقم للبنات موضة 2026 🐼](https://melynehouse.com/products/---%D8%B7%D9%82%D9%85-%D9%84%D9%84%D8%A8%D9%86%D8%A7%D8%AA-%D9%85%D9%88%D8%B6%D8%A9-2026---), public ID `6a9227d7ab8f19f0a234af25`, SKU `P35`, category `kids`.
- No product name or slug in the live catalog matched `Daniel` or `دانيال` at extraction time. The update therefore imports the single verified new MELYNE listing.

## Import

- Before mutation, `npm run db:backup` created `var/backups/melyne-2026-11-15T17-34-57-975Z.dump` locally.
- `node --env-file=.env scripts/sync-new-public-products.mjs` reported one new product in dry-run mode.
- `node --env-file=.env scripts/sync-new-public-products.mjs --apply` imported only that product. It preserved the original 34 records and owner edits.
- Imported 15 color/size combinations and three ordered gallery images. Fourteen variants have public stock of 10,000; `P35 Gray / 5-6 ans` has zero and is unavailable for purchase.
- Original images and smaller web copies are in `public/images/products/6a9227d7ab8f19f0a234af25/`. Their source URLs, order, and variant associations are in `data/catalog-updates/2026-11-15.json`.
- The public product base field was `219.98 MAD`, while every purchasable variant was `249.98 MAD`. The local card uses the lowest available variant price, `249.98 MAD`, so its displayed price can be purchased. The base value is retained as `sourceBasePrice` for review. Public comparison price: `379.98 MAD`.
- Public description was absent; stored as `null`. No description was invented.
- PostgreSQL after import: 35 products, 483 variants, 210 images. Children: 28 products. Public storefront API returns 35 products and includes the new item.
- A second sync dry run found zero new products, confirming no duplicate import.
- `data/products.json` remains the original 34-product extraction snapshot. PostgreSQL is the storefront and owner-dashboard source of truth.

## Navigation and browser check

- Removed the permanent Home underline. Desktop and mobile navigation now mark the current route with `aria-current="page"` and the active styling. Product pages mark their category when one is present.
- Headless Chrome checked direct loads at 1440px and 390px for Home, Women, Men, Children, Contact, and the new product. All expected active links matched. A click from Home to Children also moved the underline. Product images loaded and neither viewport had page-level horizontal overflow.
- Screenshots: `docs/qa-live-catalog-update/` (`home`, `women`, `men`, `kids`, `contact`, `product` at 1440px and 390px).
- `npm run check` passed the catalog snapshot validation, automated tests, and production build. The existing Vite large-chunk warning remains.

## Scope

Local only. No live website, Google Sheet, deployment, or GitHub push was changed. Existing unrelated favicon work in the working tree was left untouched.
