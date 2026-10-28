# MELYNE owner data model

PostgreSQL is the source of truth. Google Sheets receives an operational copy of orders only; it is never queried for catalog, banner, price, stock, or ordering data.

## Core tables

- `categories`: stable imported IDs, slugs, Arabic names, deterministic category order.
- `products`: stable imported product IDs; original and display names; sanitized detailed HTML, short description, MAD sale/comparison prices; private buying cost and supplier; public tags, brand, model, badge and SEO fields; optional internal physical measurements; publication state; fallback ordering; independent featured state/order; option definitions.
- `product_categories`: many-to-many category membership plus explicit per-category `sort_position`.
- `product_variants`: stable imported variant IDs, selections, server-authoritative price, stock and availability, image association, and nullable `retired_at`.
- `product_images`: stable imported image IDs, persistent-storage keys/URLs, alternative text and explicit image order. Replacements keep the image ID so variant associations survive.
- `banners`: Arabic content, desktop/mobile media, safe destination, status, active range and order.
- `orders`: private COD customer record, totals calculated by the server, fulfillment status and Google Sheet synchronization state.
- `order_items`: immutable product and variant snapshots as well as optional live foreign keys. Archiving a product never erases historical order details.
- `admin_users` and `admin_sessions`: scrypt password hashes and hashed, expiring sessions/CSRF tokens. Plaintext passwords and session tokens are never stored.
- `upload_assets`: immutable metadata and checksums for files written to persistent storage.
- `admin_audit_log`: owner actions, affected entity and request identifier without storing credentials.

## Deterministic ordering

Category pages use `product_categories.sort_position`, then stable product ID. Homepage featured products use `products.featured_sort_position`, then category fallback position and stable product ID. Banners use `banners.sort_position`, then stable banner ID.

## Publication and deletion

Products are `draft`, `published`, `hidden`, or `archived`. Banners are `draft`, `published`, or `archived`. Admin “delete” operations archive by default. Public APIs return only published products and currently active published banners. Product buying cost, supplier, weight, and dimensions are returned only by the authenticated owner API.

## Price and availability authority

Variant retirement is separate from temporary unavailability and stock. An omitted variant in an owner product update is retired (`retired_at` set and `available=false`), not deleted. The owner API includes retired variants for editing; public catalog responses omit them and remove option values belonging only to retired variants. Reactivation keeps the original variant ID and existing stock, but starts unavailable until the owner explicitly makes it available. An existing combination cannot be recreated with a different ID. Order-item snapshots, live foreign keys, and stock movements remain intact; cancellation may restore stock to a retired variant, but cannot make it purchasable. Archiving a product leaves its variants and order history intact; restoring the product leaves it hidden until separately published.

The public order request sends only product ID, variant ID and quantity. The server loads current database rows, checks publication, availability and stock, and calculates MAD totals inside one transaction. Client-supplied prices are rejected by the strict request schema.

