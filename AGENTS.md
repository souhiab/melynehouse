# Prototype Instructions

Confirmation queue refinement: show exactly one complete order at a time with explicit Previous/Next controls; saving must not auto-advance or skip the next matching order. Show real order summary counts and current product inventory/SKU separately from historical purchased details. Include the supplied French/Darija follow-up labels as auditable contact outcomes; keep real confirmation/cancellation/shipping transitions and inventory protections distinct.

Confirmation employee workspace: confirmation logins land on Orders. Show all saved customer/contact/address details, every historical item with thumbnail/color/size/quantity/prices, saved totals/discounts, notes and one role-aware status control inline in one workspace. Reuse WhatsApp/Copy actions and inventory-safe status processing. Include search, status filters, oldest-first queue and a server-scoped “assigned to me” filter; keep the super-admin Orders design unchanged.

Store management phase preference: add an internal Store hub with Themes, Media, Pages, Menus, Customizer and Blog, separate from View Store. For this phase connect existing tools only: image library/uploads, page previews, current theme preview and links to banners/ordering. Clearly label unavailable page/menu/blog/customizer editing; do not create unsupported editors or theme installers yet.

Marketing brand-color preference: use recognizable platform colors in Marketing cards, setup headers and sidebar child links: Facebook blue, TikTok black/white with cyan-pink accents, LinkedIn blue, X black/white, Snapchat yellow/black, Google multicolor, and a neutral dark treatment for the unconfigured ChatGPT item. Reuse the same compact brand badges in the sidebar. Keep the surrounding MELYNE green/cream layout.

Marketing preference: provide a three-column card hub inspired by the supplied screenshot, with MELYNE green/cream and Arabic RTL. Include discounts, upsells, reviews and all seven shown tracking/integration options. Discounts, recommendations and moderated reviews must affect the local storefront when enabled. Keep third-party tracking disconnected until verified setup; do not invent an operational ChatGPT Pixel or accept arbitrary tracking scripts.

Product purchase hierarchy: show size/options before price, then availability and quantity. The local prototype's fixed “5 left” message is demo copy, explicitly labeled as not actual inventory; unavailable selections still show unavailable and all purchase limits continue using verified stock.

Product WhatsApp update: remove the wide inline WhatsApp action below Add to Cart. Keep only the floating corner WhatsApp button on product pages. This supersedes the earlier three-main-actions preference.

Product gallery preference: replace product-page breadcrumbs with the original product title above the gallery. Show color choices as a vertical photograph-only rail beside the main image, without visible color-name captions; retain accessible names, selected state, real image mappings and availability protections. Do not duplicate the product heading below.

Team performance preference: add a dedicated Team Analytics page under Analytics. Confirmation rate uses actual assigned orders as denominator and confirmations performed by the assigned employee as numerator. Do not infer historical assignments. Show confirmations by other employees separately. Super admin assigns eligible pending orders; retain assignment and confirmation attribution.

Team analytics preference: show recorded login/logout times per employee and recent access history in compact expandable team analytics. Use Morocco time; distinguish explicit logout, valid sessions and account activation. Never equate browser closure or session expiry with a recorded logout or working hours.

Team page presentation: use one compact panel containing all members and active/inactive badges. Prefer horizontal member details, aligned actions and reduced row padding; use a four-column form on wide screens with responsive wrapping. Keep Add/Edit collapsed until requested and the activity log in an expandable section; preserve existing staff permissions and actions.

Team access preference: existing owner is super admin. Team profiles are order confirmation, order follow-up, and products/marketing. Super admin manages staff credentials, roles and access; disabling accounts preserves attribution and activity history. Enforce permissions server-side and never store plaintext passwords.

Product SKU preference: automatically generated product references remain owner-editable in drafts and existing products; preserve uniqueness and never let an older autosave response overwrite a newer manual edit.

Footer upper-block correction: use edge-to-edge WHITE behind the centered logo, description and colored social buttons, with the original dark logo. No green side strips or rounded card corners. This supersedes the black upper-block preference. Benefits and lower links remain dark green.

Footer refinement: only the centered upper logo/description/social block uses a black background; retain dark green for benefits and links. Use recognizable Facebook blue, WhatsApp green, Instagram multicolor and TikTok black/cyan/pink treatments. Keep the upper block compact with a smaller logo and tighter spacing.

Footer preference: centered MELYNE logo first, then the three verified benefit boxes in a horizontal row, then Groups/Help/Contact in three columns. Preserve this order and column structure on mobile and desktop, scaling spacing and type to fit; avoid a separate duplicate homepage benefits panel.

Phone hero refinement: below 520px, slightly reduce the family headline, supporting copy, CTA height and vertical spacing so categories appear sooner. Preserve the photo and both delivery benefits; desktop/tablet hero sizes stay unchanged.

Dashboard welcome-card color: use light green (#dceedd) with dark-green text and a matching green Analytics button. This supersedes the earlier light-blue welcome-card preference; keep its approved size/layout.

Dashboard-home visual refinement: use the owner's latest blue reference for the welcome banner, blue/green KPI accents, soft pink conversion icon, compact metric rows and taller white chart panels. This overrides the earlier green-only dashboard-home card preference; preserve Arabic RTL and verified metrics.

Owner home preference: use the supplied KPI reference's wide welcome card, two compact 24-hour metrics, two secondary metrics, hourly value chart and status donut. Preserve Arabic RTL and MELYNE green/cream. Use PostgreSQL totals; label order value separately from collected revenue and display unavailable visitor/conversion tracking honestly.

Product editor preference: General Information contains product name, persistent category selection/creation, sale/comparison prices, short/original/formatted descriptions and existing images. Do not show original-name, purchase-cost, brand, model, supplier or tags inputs; preserve legacy metadata on save. Keep only one formatted description editor, with no separate detailed-description panel. Exchange-policy presentation uses coherent Arabic paragraphs without changing its published conditions.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Product purchase UI preference: on product pages, show color, size, stock, and quantity before exactly three main actions in this order: prominent full-width Arabic Buy Now, secondary Add to Cart, then product-specific WhatsApp. Do not add a product-page Call Us/telephone button. Keep the floating public WhatsApp action. Buy Now bypasses cart review but must preserve cart contents and use the existing local checkout. Keep demo/local-order limitations explicit.

Owner dashboard design preference: keep MELYNE's dark-green, cream, neutral Arabic RTL identity. On Products, place a clear title/Add Product action above real catalog summary cards, then search/filter and the existing list. The right sidebar must collapse to usable icon-only navigation on desktop and become a closable drawer on mobile; preserve all owner destinations and local-only operations.
Keep the owner sidebar's hamburger near its top-left edge (about 18px inset). Keep navigation and logout icons/text compact enough that Arabic labels fit comfortably within the sidebar without clipping or wrapping; this supersedes the earlier 20%-larger request. Preserve its dark-green palette, RTL layout, active accent, and icon-only collapsed mode.
For owner product management, use Storeino screenshots only as workflow/layout inspiration: keep MELYNE branding, Arabic RTL, grouped right-side navigation, sectioned product editing, real local database fields, and a sticky save action. Do not imitate Storeino branding or show unsupported AI, shipping, marketing, or growth controls.

Owner lifecycle preference: retiring an obsolete size/color combination must preserve its variant ID, order snapshots, and stock movement history. Keep retired variants visible only to the owner, distinct from temporarily unavailable or out-of-stock variants. Reactivation should be deliberate and should not immediately enable purchases.

Owner navigation preference: Orders and Products are expandable Arabic RTL sections with two separate sibling controls per row. The icon/label navigates to the section's All page; the left chevron only toggles its child links. In icon-only desktop mode hide chevrons and child lists but keep the parent icons functional. Do not make Customers, Payments, or Invoices appear operational until real backend workflows exist.

Brand favicon preference: keep the MELYNE butterfly mark legible at browser-tab size in warm yellow on a square background matching the storefront's main dark green (#355440). Do not use the full wide logo as the favicon. This supersedes the earlier blue-and-white favicon request.

Owner Orders design preference: use a compact Arabic RTL management page in MELYNE's dark green and cream styling. The desktop table columns run right-to-left as phone, customer full name, product, color, size, city, saved MAD total, status, and order date. Keep Copy above WhatsApp in a vertical action group beside the LTR phone number. At 1440px, fit all nine columns without horizontal scrolling in both sidebar states; redistribute width as the sidebar collapses. Switch to complete order cards when nine readable columns cannot fit, including tablet and mobile. Mobile card hierarchy is phone and contact actions, customer name, product, color and size, city, price, status, then date and actions. WhatsApp confirmation drafts use saved historical order items and verified public product links; they open only on an explicit owner click. Keep status choices in the fixed Pending, No Response, Confirmed, Preparing, Shipped, Delivered, Cancelled order. Show full historical order details in a drawer, use real database counts and filters, and never add a delete-order or fake delivery action.

Mobile homepage preference: keep the approved desktop hero and three photographic category banners. On phones, show compact side-by-side RTL category cards with horizontal swipe and visible HTML labels, using the existing images cropped toward the photography because their original titles are baked in. Keep the hero headline, shopping action and both delivery benefits, but reduce excess vertical spacing so categories and products appear earlier. On tablets, show all three categories in one row where they remain readable.

Mobile homepage benefits preference: show the three verified store-benefit items in one compact horizontal row on phones and tablets, with icons above Arabic titles and the existing supporting text underneath. Keep the pale-blue panel and RTL ordering, without stacking the three items vertically on normal mobile widths.

Storefront catalog and checkout preference: keep catalog filters closed by default in an accessible right-side drawer so product cards use the page width; show active-filter count and removable selections. Keep checkout compact, with the customer form on the right and itemized order summary plus one submit action on the left on desktop. On phones, stack the form and summary, allow the item list to expand, and keep the known products-only amount visible. Preserve Arabic RTL, verified prices, unknown-shipping disclosure, and the local prototype notice.

Catalog listing preference: show the category title, actual product count, secondary breadcrumb, search, filter button, and sort control in a compact header so real product photography appears early on desktop and mobile. Avoid large decorative category banners or repeated counts on an unfiltered listing; preserve the shared RTL layout and existing product cards.

Storefront navigation preference: the underline and active state follow the current page in desktop navigation and the mobile menu, including category product pages. Keep the real PostgreSQL catalog current with newly verified public MELYNE products while preserving existing owner edits and product records.
