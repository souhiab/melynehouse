import test from "node:test";
import assert from "node:assert/strict";
import { productSchema } from "../server/validation.mjs";

const product = {
  slug: "audit-variant", originalName: "Audit", displayName: "Audit",
  priceMad: 100, availability: "available", status: "draft",
  categorySlugs: ["kids"], featured: false,
  options: [{ id: "color", name: "Color", key: "color", values: [{ id: "red", label: "Red" }] }],
  variants: [{ name: "Red", selections: [{ option: "Color", optionKey: "color", value: "Red" }], priceMad: 100, stockQuantity: 1, available: true }],
};

test("product variants must match the defined option values", () => {
  assert.equal(productSchema.safeParse(product).success, true);
  assert.equal(productSchema.safeParse({ ...product, variants: [{ ...product.variants[0], selections: [{ option: "Color", optionKey: "color", value: "Blue" }] }] }).success, false);
  assert.equal(productSchema.safeParse({ ...product, variants: [{ ...product.variants[0], selections: [] }] }).success, false);
});

test("existing option labels retain significant trailing spaces on save", () => {
  const spaced = {
    ...product,
    options: [{ ...product.options[0], values: [{ id: "red", label: "Red " }] }],
    variants: [{ ...product.variants[0], selections: [{ option: "Color", optionKey: "color", value: "Red " }] }],
  };
  const parsed = productSchema.parse(spaced);
  assert.equal(parsed.options[0].values[0].label, "Red ");
  assert.equal(parsed.variants[0].selections[0].value, "Red ");
});
