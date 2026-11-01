# Catalog filters and checkout QA — 2026-11-01

## Scope and visual direction

Used the installed `.agents/skills/unslop/SKILL.md` in polish mode. Kept MELYNE's cream background, dark green controls, Arabic RTL layout, existing product photography, prices, and checkout semantics. The supplied compact checkout image was a density reference only.

Local Chrome rendered the storefront served at `http://127.0.0.1:5174` with the local API. The browser captures are in [qa-commerce](qa-commerce/), with `before-*` and `after-*` images for both `/shop/women` and `/checkout` at **1440, 1280, 1024, 768, 430, 390, 360, and 320 px**. Filter drawer captures: `after-filter-open-1440.png`, `after-filter-open-390.png`, `after-filter-open-320.png`.

## Findings and changes

| Page | Before | After |
| --- | --- | --- |
| Catalog | A permanent 235 px filter column narrowed the product grid. At 1440 px the grid had three columns. | Filters are closed by default in a right-side drawer. The grid uses four columns at 1440/1280 px, three at 1024 px, and two at tablet/mobile widths. The filter button shows a count and active filters can be removed as chips. |
| Filter drawer | Nested filter-group scrolling and a permanent sidebar occupied browsing space. | One scrollable drawer body, pinned Apply/Clear controls, backdrop and Escape dismissal, focus return, focus containment, and body scroll lock. Existing availability, size, and color options remain. |
| Checkout desktop | Full store header and excess spacing placed the title around 332 px and confirmation near 1000 px at 1440 px. Summary did not show each cart item. | Compact checkout header; title around 204 px and the single confirmation button around 568 px. Right-side form and left-side summary show both sample items, variants, quantities, line prices, products-only total, and unknown shipping disclosure. |
| Checkout mobile | Long form and summary pushed the action below the first viewport. | Required fields are stacked. The item list is expandable at 520 px and below; item count and products-only total stay visible. The 390 px button begins around 1086 px, versus around 1127 px before, even with two sample line items. |

The local test cart had two available variants with quantities 1 and 2. Line amounts were **249.98 MAD** and **299.96 MAD**; the displayed products-only total was **549.94 MAD**. Shipping remains explicitly unknown and is excluded from that amount. No customer order was submitted during browser QA.

## Browser checks

- All sixteen final listing and checkout viewport captures completed. The document width did not exceed the requested viewport at any of the eight sizes.
- At 1440, 390, and 320 px, the drawer opened on the right; options remained available; Apply closed the drawer while retaining selection; the active count and chip appeared; Clear removed the selection without resetting sort; Escape and backdrop closed the drawer; focus and body scroll were managed. **28 browser assertions passed** in `var/test-commerce-ui.mjs` (local ignored QA script).
- At checkout, the one submit button was associated with the form. Four contact fields and acceptance of exchange policy remained required, the phone input remained `tel`, the two saved cart items and total rendered, and the prototype notice and policy link remained visible. On mobile the item list expanded on request.
- The browser QA deliberately stopped before a valid order submission. Existing automated purchase and server tests cover submission, idempotency, stock validation, and failures.

## Automated validation

`npm run check` passed: catalog validation (**34 products, 468 variants, 207 original and optimized images**), admin and storefront tests, Sites worker tests, and the production build. Vite reported only its existing advisory about bundles above 500 kB. The Sites build left `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Remaining limits

- Shipping is not priced by this prototype, so the displayed amount is explicitly the products-only amount.
- No live checkout order or payment was created for visual QA.
- The browser checks used the local API and isolated browser cart state; they did not change catalog, orders, or inventory.
