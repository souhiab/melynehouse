# MELYNE public catalog inventory

Extraction date: 2026-09-26T01:08:38.540Z

Source: https://melynehouse.com

## Summary

- Live catalog total reported by the store: 34
- Product URLs in product sitemap: 34
- Distinct products discovered through the live catalog API: 34
- Distinct products imported: 34
- Catalog data pages visited: 3
- Category overview pages visited: 3
- Category data pages visited: 5
- Product detail pages visited: 34
- Policy/contact pages visited: 4
- Original product images downloaded: 207 (78.2 MiB)
- Web-sized product image copies downloaded: 207 (19.9 MiB)
- Failed pages: 0
- Failed image downloads: 0
- Duplicate API product IDs resolved: 0

## Reconciliation

The live shop pagination reports 34 products and the final import contains 34. The sitemap contains 34 product URLs. 0 live catalog product(s) were not present in the sitemap and were recovered from the same public catalog endpoint used by the storefront.

## Category pages

- ملابس-رجالية, data page 1: 3 products (category total 3)
- women, data page 1: 4 products (category total 4)
- kids, data page 1: 12 products (category total 27)
- kids, data page 2: 12 products (category total 27)
- kids, data page 3: 3 products (category total 27)

## Missing or unclear fields

- P34 — 🐾طقم للبنات – موضة 2026🌸: description
- P31 — 🦚طقم للبنات – موضة الربيع و الصيف🦚: description
- P30 — 🐿️فستان للبنات – موضة الربيع و الصيف🐿️: description
- P32 — 🪽طقم  للرجال موضة الربيع و الصيف🪽: description
- P33 — 🐦طقم للبنات – موضة الربيع و الصيف🐦: description
- P29 — 🧜‍♀️طقم للنساء موضة 2026 🧜‍♀️: description
- P28 — 🌻طقم مكون من 3 قطع للنساء موضة 2026 🌻: description
- P27 — 🖤اربع قطع من الفخامة: طقم الجلد البناتي الجديد 🖤: description
- P26 — 🐰 طقم 3 قطع للبنات – موضة الشتاء و الربيع 🐰: description
- P24 — 👏جيلي + سويت للرجال – موضة الخريف و الشتاء👏: description
- P-21 — 😺طقم للاولاد – موضة الخريف و الشتاء😺: description
- P23 — 🐻طقم للاولاد والبنات – موضة الخريف و الشتاء🐻: description
- P-22 — 💪جاكيط للرجال – موضة الخريف و الشتاء💪: description
- P17 — 🦄طقم للبنات – موضة الخريف و الشتاء🦄: description
- P18 — 🦩طقم للبنات – موضة الخريف و الشتاء🦩: description
- P20 — 🦀طقم للاولاد – موضة الخريف و الشتاء 🦀: description
- P16 — 🐿️ طقم للبنات – موضة الخريف و الشتاء 🐿️: description
- P19 — 👩‍🎨 طقم للبنات – موضة الخريف و الشتاء 👩‍🎨: description
- P15 — 🐥 طقم للبنات– موضة الخريف و الشتاء 🐥: description
- P25 — 🐿️ طقم للاولاد – موضة الخريف و الشتاء 🐿️: description
- P14 — 🐰 طقم للبنات موضة الخريف و الشتاء 🐰: description
- P11 — 🌸​ طقم للبنات موضة الصيف 2025 ​​​🌸: description
- p10 — 🦋طقم للبنات موضة الربيع والصيف 2025🦋: description
- P8 — طقم للنساء موضة الربيع والصيف 2025: description
- P9 — 🦩 فستان للبنات موضة الربيع والصيف 2025🦩: description
- P6 — 🍂طقم الأولاد KING موضة 2025🍂: description
- P12 — 🍂 طقم للبنات موضة 2025 🍂: description
- P5 — ⚾طقم للاطفال موضه الشتاء⚾: description
- P4 — 👑​ طقم شانيل للبنات موضة 2025​​​👑: description
- P2 — طقم نسائي موضة الصيف و الخريف 2025: description
- P1 — طقم MONSTERS من 3 قطع للأولاد الصغار: description

Stock is recorded per variant from the public variant quantity and unavailable fields. A product-level availability value is derived only from those variant records and never from the generic page label alone.

## Public-policy conflicts requiring owner confirmation

- The exchange policy says monetary refunds are not accepted, while the payment/security policy states a 30-day refund policy. Both public texts are preserved verbatim in data/store.json and displayed separately; the prototype does not resolve the contradiction.
- The footer, contact page, and complaint/exchange page expose more than one phone number. The prototype preserves the sourced contact data and flags it for confirmation.
- Product descriptions are empty on many catalog records; no description, material, included-piece detail, review, or promise was invented.

## Failures and duplicates

- No page failures.
- No image failures.
- No duplicate product IDs in the final catalog.

## Crawl notes

- robots.txt explicitly allows crawling all public paths.
- Requests used a descriptive user agent and short delays. No access controls were bypassed.
- Original media is retained locally. Web-sized copies were requested through the same public image CDN parameters used by the live storefront.
