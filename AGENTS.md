# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Product purchase UI preference: on product pages, show color, size, stock, and quantity before exactly three main actions in this order: prominent full-width Arabic Buy Now, secondary Add to Cart, then product-specific WhatsApp. Do not add a product-page Call Us/telephone button. Keep the floating public WhatsApp action. Buy Now bypasses cart review but must preserve cart contents and use the existing local checkout. Keep demo/local-order limitations explicit.

Owner dashboard design preference: keep MELYNE's dark-green, cream, neutral Arabic RTL identity. On Products, place a clear title/Add Product action above real catalog summary cards, then search/filter and the existing list. The right sidebar must collapse to usable icon-only navigation on desktop and become a closable drawer on mobile; preserve all owner destinations and local-only operations.
