# Orders contact and layout validation — 2026-10-31

## Implementation

- Desktop RTL table order: phone, full name, product, color, size, city, saved MAD total, status, date. The phone is the rightmost column. Copy and WhatsApp icons are vertically stacked beside its LTR number. The 42px product image, order number, extra-item count, date/time, status badge and selector remain.
- Mobile card order: phone/actions, name, product, color/size, city, price, status, date/time and detail action. One status selector remains per card. The existing order-detail drawer shows the full item history.
- Copy writes the saved number to the clipboard and gives Arabic success/error feedback. An invalid or missing number disables WhatsApp. A valid number opens a new `wa.me` tab with `noopener,noreferrer`; the dashboard stays open and no message is sent automatically.
- The Arabic draft uses saved customer name, order number and every historical item snapshot's name, color, size and quantity. It includes a product URL only when a published product has a verified HTTPS URL under `melynehouse.com/products/`. It never inserts a localhost URL. The storefront support action remains separate.
- No API, database, order, inventory, status-transition or Google Sheets code changed. Existing unrelated favicon edits were left untouched.

## Browser measurements

The signed-in local dashboard was inspected in headless Chrome. The [screenshots](qa-orders/) were captured from the real Orders component with isolated sample records so private customer data is absent. The table region had no horizontal overflow in every table state. The document had no horizontal overflow at any measured width.

| Viewport | Sidebar | Orders content | Presentation | Table scroll/client |
| --- | --- | ---: | --- | ---: |
| 1440 | Expanded | 1136px | Nine-column table | 1134 / 1134px |
| 1440 | Collapsed | 1314px | Nine-column table | 1312 / 1312px |
| 1280 | Expanded | 976px | Two-column cards | Not applicable |
| 1280 | Collapsed | 1154px | Nine-column table | 1152 / 1152px |
| 1024 | Expanded | 705px | One-column cards | Not applicable |
| 1024 | Collapsed | 883px | Two-column cards | Not applicable |
| 768 | Mobile drawer | 736px | One-column cards | Not applicable |
| 390 | Mobile drawer | 358px | One-column cards | Not applicable |
| 360 | Mobile drawer | 328px | One-column cards | Not applicable |

The 1280px expanded sidebar leaves 976px for content; the existing responsive fallback uses cards there to keep all information readable. Collapsing the sidebar restores the table automatically.

## Interaction and automated checks

- Signed-in browser: all nine headers in exact order; no runtime errors; mobile card sections in exact order; one status selector per card; order-detail drawer opens and closes.
- Signed-in browser with `window.open` and clipboard stubbed: Copy matched the actual saved number and displayed `تم النسخ`; WhatsApp opened a `wa.me` confirmation draft in a safe new tab with no localhost link; neither action opened order details. No customer phone or message content was logged or sent.
- `tests/order-contact.test.mjs`: Moroccan local/international and valid international normalization, ambiguous/invalid numbers, single and multiple historical items, encoded Arabic message, verified product links, retired product link omission, and localhost omission.
- `npm run check`: passed catalog validation (34 products, 468 variants), 12 admin tests, 27 storefront/owner tests, 4 Sites tests, and production build. Vite emitted its existing non-failing large-chunk advisory.
- `npm run test:order-management:postgres`: 2 isolated PostgreSQL tests passed, including protected order details and safe manual order reservation. No live order was modified during browser QA.

Screenshots: `qa-orders/orders-compact-{1440,1280,1024}-{expanded,collapsed}.png` and `qa-orders/orders-compact-{768,390,360}-expanded.png`.
