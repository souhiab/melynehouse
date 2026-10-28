import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cartItemUnavailable, checkoutLines, displayPriceForSelection, validateDirectPurchase } from "../src/purchase.js";

test("selected variant never inherits an unrelated product comparison price", () => {
  const item = { price: { current: 100, comparison: 150 } };
  assert.deepEqual(displayPriceForSelection(item), { current: 100, comparison: 150 });
  assert.deepEqual(displayPriceForSelection(item, { price: { current: 200, comparison: null } }), { current: 200, comparison: null });
});

const products = JSON.parse(fs.readFileSync(new URL("../data/products.json", import.meta.url), "utf8")).products;
const product = products.find((entry) => entry.variants.some((variant) => variant.availability === "available"));
const available = product.variants.find((variant) => variant.availability === "available" && variant.stockQuantity > 0);
const selected = Object.fromEntries(available.selections.map((selection) => [selection.option, selection.value]));

test("Buy Now keeps the exact variant and quantity separate from the cart", () => {
  const result = validateDirectPurchase(product, selected, 3);
  assert.equal(result.error, null);
  assert.equal(result.item.productId, product.id);
  assert.equal(result.item.variantId, available.id);
  assert.equal(result.item.quantity, 3);
  const cart = [{ productId: "other-product", variantId: "other-variant", quantity: 2 }];
  assert.deepEqual(checkoutLines(cart, result.item, true), [result.item]);
  assert.deepEqual(checkoutLines(cart, result.item, false), cart);
  assert.equal(cart.length, 1);
  assert.deepEqual(checkoutLines(cart, null, true), []);
});

test("Buy Now asks for missing options and rejects unavailable selections", () => {
  assert.match(validateDirectPurchase(product, {}, 1).error, /يرجى اختيار/);
  assert.match(validateDirectPurchase({ ...product, availability: "unavailable" }, selected, 1).error, /غير متوفرة/);
  const unavailable = product.variants.find((variant) => variant.availability !== "available" || variant.stockQuantity === 0);
  if (unavailable) {
    const unavailableSelection = Object.fromEntries(unavailable.selections.map((selection) => [selection.option, selection.value]));
    assert.match(validateDirectPurchase(product, unavailableSelection, 1).error, /غير متوفرة/);
  }
  assert.match(validateDirectPurchase(product, selected, 100).error, /الكمية/);
  if (available.stockQuantity != null) assert.match(validateDirectPurchase(product, selected, available.stockQuantity + 1).error, /الكمية/);
});

test("Buy Now rejects stock whose quantity is unknown", () => {
  const unverified = { ...product, variants: product.variants.map((variant) => variant.id === available.id ? { ...variant, stockQuantity: null } : variant) };
  assert.ok(validateDirectPurchase(unverified, selected, 1).error);
});

test("retired variants cannot be bought directly or through a saved cart", () => {
  const retired = { ...available, retired: true };
  const staleProduct = { ...product, variants: product.variants.map((variant) => variant.id === available.id ? retired : variant) };
  assert.ok(validateDirectPurchase(staleProduct, selected, 1).error);
  assert.equal(cartItemUnavailable({ product: staleProduct, variant: retired, quantity: 1 }), true);
  const publicProduct = { ...product, variants: product.variants.filter((variant) => variant.id !== available.id) };
  assert.equal(cartItemUnavailable({ product: publicProduct, variant: undefined, quantity: 1 }), true);
});
