# Orders compact layout — local validation (2026-10-31)

## Changes

- The nine-column RTL table now runs right-to-left as product, full name, phone, city, status, saved MAD total, size, color, order date. The same compact percentage columns, 42px thumbnails, two-line product names, and status control remain. Full product/option/phone text remains available through titles and the protected order-detail drawer; the phone copy action remains.
- The existing owner CSS grid already uses `--owner-sidebar-width` (256px expanded, 78px collapsed). The Orders main area now has focused 24px padding and `min-width: 0`; its width follows that grid without a new sidebar state or reload.
- The Orders page is a CSS inline-size container. When its content width is at most 1050px, it shows the existing full-information cards instead of forcing an unreadable table. Cards use two columns when the content width is at least 760px. The 390px layout remains one column. Heading, summary, filter, and list gaps were reduced without changing order operations.
- No API, database, customer data, order status, or inventory code changed. Existing unrelated favicon edits remain untouched.
- The card information order is now product identification → status and saved total → customer name and phone → city, size and color → date/time and actions. The product header and explicit bottom action both open the existing detail drawer. Each card contains exactly one status selector; the status badge is display-only.

## Browser measurements

Measured in signed-in headless Chrome on the local running app. `table scroll` is the Orders table region's `scrollWidth/clientWidth`; hidden tables use cards. The document had no horizontal overflow at any measured width.

| Viewport | Sidebar | Content width | Presentation | Table scroll |
| --- | --- | ---: | --- | --- |
| 1440 | Expanded (256px) | 1136px | Nine-column table | 1134 / 1134px — none |
| 1440 | Collapsed (78px) | 1314px | Nine-column table | 1312 / 1312px — none |
| 1280 | Expanded (256px) | 976px | Two-column cards | Not applicable |
| 1280 | Collapsed (78px) | 1154px | Nine-column table | 1152 / 1152px — none |
| 1024 | Expanded (256px) | 720px | One-column cards | Not applicable |
| 1024 | Collapsed (78px) | 898px | Two-column cards | Not applicable |
| 768 | Mobile drawer | 736px | One-column cards | Not applicable |
| 390 | Mobile drawer | 358px | One-column cards | Not applicable |
| 360 | Mobile drawer | 328px | One-column cards | Not applicable |

The 1280px expanded state deliberately uses cards: a 976px content area could not hold nine readable columns and a status selector without crowding. Collapsing the sidebar promotes it back to the full table automatically.

## Visual and functional checks

These [nine screenshots](qa-orders/) were captured at the widths/states above using the real Orders component and styling with isolated sample records, not real customer details: `orders-compact-1440-expanded.png`, `orders-compact-1440-collapsed.png`, `orders-compact-1280-expanded.png`, `orders-compact-1280-collapsed.png`, `orders-compact-1024-expanded.png`, `orders-compact-1024-collapsed.png`, `orders-compact-768-expanded.png`, `orders-compact-390-expanded.png`, and `orders-compact-360-expanded.png`. They show the updated RTL column order, aligned headers, visible status/price, no clipped thumbnails, and the new card hierarchy. The 390px and 360px screenshots use Chrome device emulation rather than a cropped 504px CLI viewport.

The signed-in local app was also measured before and after clicking the existing sidebar toggle, without reload. All nine table headers appeared in the exact requested order; at 1440px and 1280px collapsed the table region's scroll width equaled its client width. The page rendered with no runtime errors, each card had one status selector, and a mobile order-detail drawer opened and closed successfully. The server-side Orders search, filters, pagination, and status handling were not changed. No order mutation was performed in browser QA.

`npm run check`: passed catalog validation (34 products, 468 variants, 207 original images), all admin/storefront/Orders/Sites tests, and the production build. Vite still prints its non-failing large-chunk advisory. `npm run test:order-management:postgres`: passed both isolated PostgreSQL tests, including safe order handling and protected order details.
