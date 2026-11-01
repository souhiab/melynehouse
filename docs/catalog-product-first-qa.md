# Product-first catalog QA — 2026-11-01

## Scope and direction

Used the installed Unslop skill by Damir Sokolovsky (CC BY 4.0) in light-polish mode. This phase changed only the shared customer catalog listing header and its spacing. The global header, homepage, product details, cart, checkout, API, and catalog data remain as before.

- **Product:** MELYNE customers browse real family clothing and select an available item.
- **Character:** warm, direct, orderly.
- **World:** MELYNE product photography, cream space, dark-green actions, Arabic Cairo type.
- **Moments:** the real first row of clothing images carries the color and detail.
- **Signature:** a quiet Arabic category heading with a real count and a secondary breadcrumb.

## Baseline and result

The baseline had a separate breadcrumb row, a 195 px pale-blue title block on desktop (164 px on mobile), duplicate count wording, and another results row before products. The new listing keeps one semantic H1, one count derived from the public catalog, and the existing search/filter/sort controls. The results count appears only when search or filters are active. The filter drawer and product grid are reused.

| Listing | Public products | First image top at 1440 px | First image top at 390 px |
| --- | ---: | ---: | ---: |
| All Products | 34 | 596 → **348 px** | 523 → **346 px** |
| Women | 4 | 596 → **348 px** | 523 → **346 px** |
| Men | 3 | 596 → **348 px** | 523 → **346 px** |
| Children | 27 | 596 → **348 px** | 523 → **346 px** |

That moves the first product row **248 px higher** on desktop and **177 px higher** at 390 px. The count is dynamic; `34` is a measured result, not a hardcoded UI value. The 1440 px screenshot shows product names and prices within the first viewport. Product images retained their original rendering rules and sources.

## Browser evidence

Chrome rendered before and after screenshots for all four listings at **1440, 1280, 1024, 768, 430, 390, and 360 px** in [qa-catalog-phase1](qa-catalog-phase1/). Before screenshots of homepage, product detail, cart, and checkout at 1440 and 390 px support the wider audit. The final listing captures had no page-wide horizontal overflow at any requested width. Arabic text and the compact heading aligned correctly in the reviewed desktop and mobile captures.

The local browser interaction script in ignored `var/test-catalog-phase1.mjs` passed **51 assertions**: category counts and headings, default closed drawer, real filter controls, applying and clearing a filter, sorting, live search results, product navigation, and mobile menu access on desktop and mobile. It did not submit an order or alter catalog data.

## Validation and limits

`npm run check` **passed**: catalog validation (34 imported products, 468 variants, 207 original and optimized images), admin and storefront tests, Sites worker tests, and the production build. The build left `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`. Vite emitted its non-failing advisory about JS chunks over 500 kB.

The local public catalog currently includes a published product whose title contains `اختبار PostgreSQL محلي`. That is a data/content issue for owner review, not a Phase 1 layout change. The broader recommendations are in [customer-storefront-ux-audit.md](customer-storefront-ux-audit.md).
