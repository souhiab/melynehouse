# Variant chip editor

Local implementation on the existing product editor. `OptionChips.jsx` replaces the two forced comma-inputs with an initially empty selector. Existing products load their saved options unchanged. Color or Size can be chosen first; custom existing options remain editable and custom option creation remains supported.

Enter/comma commit complete text, Space commits only recognized unambiguous tokens, and IME composition suppresses delimiters. Blue/Light/numeric ages remain open for multiword input. Paste preserves text. Escape cancels only uncommitted editing. Chips support edit/removal and normalized duplicate prevention. Imported exact labels remain unchanged unless explicitly edited.

`color-recognition.js` provides exact English/French/Arabic aliases, accent/Arabic normalization and explicit P-number prefixes. No arbitrary substring guessing. Existing six-digit HEX `secondaryLabel` takes priority; newly recognized colors store their swatch in that existing field. Unknown colors retain null swatches and can be corrected with a native color picker. Swatch changes never change textual labels or variant/image IDs. No migration or dependency was added.

Confirm Options calls the existing `buildVariants`; it does not publish. Unchanged combinations retain stock, prices, IDs and images. Removed combinations retire; previously retired combinations retain their identity and unavailable lifecycle. The existing system does not generate a purchasable default variant for an optionless product; this behavior was preserved rather than inventing stock.

Modified files: `src/admin/AdminApp.jsx`, `src/admin/admin.css`; added `src/admin/OptionChips.jsx`, `src/admin/color-recognition.js`, `tests/color-recognition.test.mjs`.

Validation: three targeted recognition/tokenization tests passed; PostgreSQL product-editor, variant-lifecycle and inventory/concurrency tests passed using isolated data. `npm run check` passed. Responsive chip CSS wraps at narrow widths and stacks rows below 600px, but browser screenshots and interactions at 1440/1280/768/390/360 remain unverified. Native autocomplete/picker behavior, IME and rapid keyboard interaction require browser acceptance. No real catalog/order mutations, Sheets changes, deployment or push occurred.
