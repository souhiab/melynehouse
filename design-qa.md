# MELYNE visual and interaction QA

**Run date:** 2026-09-26  
**Source visual truth:** `references/homepage-design.png`  
**Source dimensions:** 1374 × 1145 px  
**Implementation:** `http://localhost:4173`  
**Preview health:** HTTP 200; Vite preview is running  
final result: blocked

## Blocker

The configured browser controller returned no available browser surfaces. Therefore no browser-rendered implementation screenshot, DOM measurement, console inspection, keyboard walkthrough, or end-to-end shopping interaction could be captured. Build success and HTTP route health are not being treated as visual QA.

## Findings

- **[P0 — QA blocker] Browser-rendered evidence is unavailable**
  - **Page:** all routes.
  - **Viewport:** required at 1440 × 1200, 768 × 1024, and 390 × 844 CSS px, DPR 1.
  - **Screenshot:** missing; no browser surface was available.
  - **Evidence:** the preview returns HTTP 200, but the browser availability check returned an empty set.
  - **Impact:** layout, responsiveness, typography, focus behavior, console errors, and the shopping journey cannot be truthfully marked as visually verified.
  - **Proposed fix:** attach an available in-app or extension browser, then run the capture and interaction matrix below.

- **[P1 — asset/content] Category labels and arrows are baked into raster crops**
  - **Page:** homepage category row.
  - **Viewport:** all.
  - **Evidence:** `public/images/reference/category-kids-web.jpg`, `category-women-web.jpg`, and `category-men-web.jpg` visibly contain “ملابس…”, “تسوق الآن”, and the arrow inside the pixels.
  - **Design evidence:** those labels appear as interface copy in the reference and should remain adaptable, selectable, and accessible rather than being part of the photograph.
  - **Impact:** text can blur when scaled, cannot reflow on mobile, cannot adapt to localization or high-contrast modes, and may be duplicated if semantic HTML labels are later added.
  - **Proposed fix:** produce clean text-free versions of the same three photographs, then render the category title and CTA as RTL HTML overlays with matching responsive typography. This should be visually verified before replacing the current assets.

- **[P0 — interaction evidence] Core shopping and accessibility paths remain unverified**
  - **Page:** homepage → category → product → cart → checkout, plus search/wishlist/filter states.
  - **Viewport:** desktop and mobile.
  - **Screenshot:** missing for the states listed below.
  - **Evidence:** direct product route health is HTTP 200 and automated catalog/build tests pass, but no real browser could exercise controls or inspect focus/disabled states.
  - **Impact:** add-to-cart, unavailable variants, filter drawer, persistence, keyboard order, visible focus, and checkout prototype messaging cannot be certified.
  - **Proposed fix:** execute the interaction checklist in an attached browser and capture the named states.

## Required screenshot capture matrix

Capture at **100% browser zoom**, **device scale factor 1**, with browser chrome excluded. Save PNG files under `qa/screenshots/` using these exact names.

### Responsive homepage

1. `home-desktop-1440x1200.png` — viewport 1440 × 1200, full page from announcement bar through footer.
2. `home-tablet-768x1024.png` — viewport 768 × 1024, full page with mobile/tablet header state visible.
3. `home-mobile-390x844.png` — viewport 390 × 844, full page.
4. `home-desktop-header-1440x500.png` — top 500 px focused on announcement bar, search, logo, icons, navigation, and hero boundary.
5. `home-desktop-categories-products-1440x700.png` — category row and first product row at readable scale.

### Shopping and discovery states

6. `category-kids-desktop-1440x1200.png` — `/shop/kids`, default listing with search, sort, filters, and several cards.
7. `category-filters-mobile-390x844.png` — `/shop/kids` with the filter drawer open after selecting one size and “المتاح فقط”.
8. `search-results-desktop-1440x1200.png` — `/shop?search=طقم` with query and result count visible.
9. `product-available-desktop-1440x1200.png` — a children’s product with an available color/size selected and enabled add-to-cart button.
10. `product-unavailable-mobile-390x844.png` — the same product showing disabled/unavailable variant values and purchase prevention.
11. `wishlist-mobile-390x844.png` — `/wishlist` after saving one product.
12. `cart-desktop-1440x1200.png` — `/cart` after adding the selected variant; show image, option labels, quantity, price, prototype notice, and checkout button.
13. `checkout-mobile-390x844.png` — `/checkout` with prototype banner, delivery form, cash-on-delivery choice, and disabled electronic payment visible.

### Keyboard and diagnostics

14. `focus-home-desktop-1440x500.png` — homepage after keyboard Tab places visible focus on the first meaningful header control.
15. `focus-product-desktop-1440x900.png` — product page with visible keyboard focus on a variant or add-to-cart control.
16. `mobile-menu-390x844.png` — open mobile navigation panel.
17. `console-after-shopping-flow.png` — developer console after completing the full path, filtered to errors and warnings.

## Interaction checklist to run with those captures

- Homepage navigation, category cards, search form, mobile menu, and direct product URL loading.
- Category search, sort, size/color filters, available-only filter, reset, and mobile drawer close behavior.
- Product gallery thumbnails, exact color/size labels, disabled unavailable values, quantity bounds, wishlist toggle, and add-to-cart.
- Cart quantity increment/decrement, removal, variant/price display, persistence after refresh, and checkout navigation.
- Prototype checkout required-field validation, disabled electronic payment, policy link, and prototype confirmation without a network order.
- Keyboard-only traversal, skip link, visible focus, Enter/Space activation, Escape closing mobile panels, and no keyboard trap.
- Desktop/tablet/mobile horizontal overflow, clipped Arabic text, broken wrapping, image softness, layout shifts, and console errors.

## Evidence completed without a browser

- Source reference and all three category crop files were opened at original resolution.
- Preview homepage and a direct product route return HTTP 200.
- Catalog validation passes: 34 products, 468 variants, 207 original images, and 207 optimized images.
- Production build passes.
- Static/SPA route-worker tests pass: 4 of 4.
- Non-blocking build warning: the main JavaScript chunk is approximately 689 kB minified (120 kB gzip).

## Required fidelity surfaces pending browser evidence

- **Typography:** Cairo/font rendering, weight, scale, wrapping, and Arabic optical alignment.
- **Spacing/layout:** header/hero proportions, category gaps, product density, footer rhythm, and responsive overflow.
- **Colors/tokens:** green/cream balance, contrast, focus ring, disabled states, and semantic availability colors.
- **Image quality:** rendered hero/category sharpness, catalog crop quality, and layout stability while images load.
- **Copy/content:** no duplicate baked category copy, correct MAD price display, prototype checkout labels, and policy wording.

## Comparison history

- **Pass 1:** source visual opened; preview health and build confirmed; browser capture attempted.
- **Result:** blocked before side-by-side comparison because no browser surface was available.
- **Verified finding:** baked category interface text identified directly in the three raster assets.
- **Fixes made:** none. The asset correction and any layout changes are intentionally deferred until rendered screenshots can verify them.

## Implementation checklist

1. Supply the 17 named screenshots or attach an available browser surface.
2. Compare the desktop homepage capture with the source in one combined view.
3. Fix the baked category text with text-free imagery plus semantic HTML overlays.
4. Re-capture all affected desktop/tablet/mobile states.
5. Complete the shopping, keyboard, and console checks.
6. Mark `final result: passed` only after no actionable P0/P1/P2 findings remain.

