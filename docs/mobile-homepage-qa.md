# Mobile homepage polish — local validation (2026-10-31)

## Initial assessment and direction

The desktop hero and three category banners already carried the MELYNE identity, so this was an Unslop polish pass. The mobile issue was layout density: at 390px, the category section was 602px tall, and at 768px it was 924px tall. The hero copy also had a 315px minimum height on phones. The category titles are baked into the existing JPG assets, so simply shrinking those images would make the text unreadable.

- **Product:** Arabic family fashion storefront for MELYNE shoppers.
- **Character:** warm, composed, approachable.
- **World:** cream fabric, family photography, dark green store accents.
- **Moment:** the family hero followed by a compact photographic category strip.
- **Signature:** MELYNE's existing family and fashion photography, with restrained green actions.

Unslop by Damir Sokolovsky ([@heydamir](https://github.com/heydamir/unslop)), CC BY 4.0. The skill was installed at `.agents/skills/unslop/` with its license. Its spacing, layout, restrained-detail, focus and real-visual guidance informed the targeted changes; its optional story/video and image generation were not used.

## Changes

- The phone category section is a horizontally scrollable RTL grid. At 390px it shows two 160px cards and a peek of the third. At 320px it shows two 136px cards and a peek. Scroll snapping keeps each card aligned. At 768px, all three categories fit in one row. Desktop dimensions and assets remain unchanged.
- The existing category JPGs contain Arabic titles. Phone cards crop toward the models and use separate, legible HTML labels below the photographs. The image is decorative within each accessible, whole-card category link. No new images were generated.
- Phone hero copy uses a smaller headline, tighter gaps and padding, and compact trust details. The shopping button and both delivery benefits remain.
- The category section has a visible keyboard focus outline; individual category links retain visible focus. The strip scrolls independently without page-wide horizontal overflow. The floating WhatsApp action remains in place.

## Browser measurements

Before and after screenshots are in [qa-home-mobile](qa-home-mobile/). Captured in headless Chrome from the local storefront at 320, 360, 390, 430, 768, 1024, 1280 and 1440px. The after screenshots use the refreshed preview on port 5174; the long-running port 5173 process was serving stale `App.jsx` and was left untouched after an automatic review rejected stopping it.

| Width | Category height before | After | Hero bottom before | After | Layout after |
| ---: | ---: | ---: | ---: | ---: | --- |
| 320 | 493px | 168px | 601px | 540px | Horizontal cards |
| 360 | 555px | 168px | 618px | 519px | Horizontal cards |
| 390 | 602px | 168px | 631px | 536px | Horizontal cards |
| 430 | 665px | 168px | 604px | 536px | Horizontal cards |
| 768 | 924px | 124px | 776px | 716px | Three cards in one row |
| 1024–1440 | unchanged | unchanged | unchanged | unchanged | Three desktop banners |

At 390px, programmatic RTL scrolling moved the strip from `scrollLeft: 0` to `-133`, revealing the Women card. Its link navigated to `/shop/women`. The three card links still point to Children, Men and Women in that right-to-left order. The document width matched the viewport at all eight measured sizes.

## Validation and limitations

`npm run check` passed catalog validation (34 products, 468 variants), existing frontend/admin/Sites tests and the production build. Vite's large-chunk advisory remains non-failing. Visual inspection confirmed readable labels, photo cropping without duplicated embedded titles, preserved hero content, and no overlap or page-wide overflow at the listed breakpoints. Touch swipe was approximated through browser scrolling; no physical phone was tested.
