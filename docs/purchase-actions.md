# Local product purchase actions

Buy Now validates the selected options, variant availability, and quantity, then opens the existing local COD checkout with only that item. It does not add to or clear the saved cart. The direct selection is kept in session storage so a checkout refresh retains it; if that selection is missing, checkout fails closed rather than silently submitting the cart. The API still rechecks published status, variant, stock quantity, and price on submission.

The checkout currently saves a COD test order in the local PostgreSQL database. It does not accept online payment, send the order to the live MELYNE store, reserve stock, notify the owner, or start fulfillment. Production use requires an operational order workflow, owner notifications, stock/reservation handling, and deployment of the API/database with appropriate security and backups.

The product purchase section has three main actions in order: Buy Now, Add to Cart, and product-specific WhatsApp. There is no product-page Call Us action. The floating WhatsApp action remains on public storefront pages, and its message uses the existing shared utility.
