# Orders compact layout — local validation (2026-10-31)

## Changes

- The nine-column RTL table retains this order: product, full name, city, phone, size, color, order date, saved MAD total, status. Its old `min-width: 1650px` was removed. It now fills its container with percentage columns, smaller cell padding, 42px thumbnails, two-line product names, and a compact status control. Full product/option/phone text remains available through titles and the protected order-detail drawer; the phone copy action remains.
- The existing owner CSS grid already uses `--owner-sidebar-width` (256px expanded, 78px collapsed). The Orders main area now has focused 24px padding and `min-width: 0`; its width follows that grid without a new sidebar state or reload.
- The Orders page is a CSS inline-size container. When its content width is at most 1050px, it shows the existing full-information cards instead of forcing an unreadable table. Cards use two columns when the content width is at least 760px. The 390px layout remains one column. Heading, summary, filter, and list gaps were reduced without changing order operations.
- No API, database, customer data, order status, or inventory code changed. Existing unrelated favicon edits remain untouched.

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

The 1280px expanded state deliberately uses cards: a 976px content area could not hold nine readable columns and a status selector without crowding. Collapsing the sidebar promotes it back to the full table automatically.

## Visual and functional checks

These [eight screenshots](qa-orders/) were captured at the widths/states above using the real Orders component and styling with isolated sample records, not real customer details: `orders-compact-1440-expanded.png`, `orders-compact-1440-collapsed.png`, `orders-compact-1280-expanded.png`, `orders-compact-1280-collapsed.png`, `orders-compact-1024-expanded.png`, `orders-compact-1024-collapsed.png`, `orders-compact-768-expanded.png`, and `orders-compact-390-expanded.png`. They show correct RTL order, aligned headers, visible status/price, no clipped thumbnails, and readable cards. The 390px screenshot uses Chrome device emulation rather than a cropped 504px CLI viewport.

The signed-in local app was also measured before and after clicking the existing sidebar toggle, without reload. All nine table headers remained in the DOM, the page rendered with no runtime errors, and a mobile order-detail drawer opened and closed successfully. The server-side Orders search, filters, pagination, and status handling were not changed. No order mutation was performed in browser QA.

`npm run check`: passed catalog validation (34 products, 468 variants, 207 original images), all admin/storefront/Orders/Sites tests, and the production build. Vite still prints its non-failing large-chunk advisory. `npm run test:order-management:postgres`: passed both isolated PostgreSQL tests, including safe order handling and protected order details.
