import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { colorOptionFor, imagesForColor, thumbnailForColor } from "../src/product-colors.js";
import { generalWhatsAppMessage, productWhatsAppMessage, publicProductUrl, whatsAppHref } from "../src/whatsapp.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/products.json", import.meta.url), "utf8"));
const products = catalog.products;
const domain = "https://melynehouse.com";

test("all imported colors use real images linked by variant IDs", () => {
  const withMultipleColors = products.filter((product) => colorOptionFor(product)?.values.length > 1);
  assert.equal(withMultipleColors.length, 29);
  for (const product of withMultipleColors) {
    for (const color of colorOptionFor(product).values) {
      const thumbnail = thumbnailForColor(product, color.label);
      assert.ok(thumbnail, `${product.sku}: ${color.label} has no linked image`);
      assert.ok(product.images.some((image) => image.id === thumbnail.id));
      assert.ok(imagesForColor(product, color.label).some((image) => image.id === thumbnail.id));
    }
  }
});

test("extra gallery images appear only with their explicitly assigned color", () => {
  const product = products.find((item) => item.sku === "P31");
  const [first, second] = colorOptionFor(product).values.map((value) => value.label);
  const linked = new Set(product.variants.map((variant) => variant.imageId));
  const extra = product.images.find((image) => !linked.has(image.id));
  assert.ok(extra);
  const assigned = { ...product, images: product.images.map((image) => image.id === extra.id ? { ...image, colorLabel: first } : image) };
  assert.ok(imagesForColor(assigned, first).some((image) => image.id === extra.id));
  assert.ok(!imagesForColor(assigned, second).some((image) => image.id === extra.id));
});

test("WhatsApp messages encode the selected product, color, size, and public URL", () => {
  const product = products.find((item) => item.sku === "P34");
  const color = colorOptionFor(product);
  const size = product.options.find((option) => option.key === "size");
  const selected = { [color.name]: color.values[0].label, [size.name]: size.values[0].label };
  const message = productWhatsAppMessage(product, selected, domain);
  assert.ok(message.includes(product.name));
  assert.ok(message.includes(`رمز المنتج: ${product.sku}`));
  assert.ok(message.includes(`اللون: ${selected[color.name]}`));
  assert.ok(message.includes(`المقاس: ${selected[size.name]}`));
  assert.ok(message.includes(product.canonicalUrl));
  const href = whatsAppHref("212776253589", message);
  assert.equal(new URL(href).hostname, "wa.me");
  assert.equal(new URL(href).searchParams.get("text"), message);
  assert.notEqual(productWhatsAppMessage(product, { ...selected, [color.name]: color.values[1].label }, domain), message);
});

test("missing options and nonpublic URLs are omitted", () => {
  const product = products.find((item) => item.sku === "P26");
  const message = productWhatsAppMessage({ ...product, canonicalUrl: "http://localhost:5173/products/test", sku: null }, {}, domain);
  assert.ok(message.includes(product.name));
  assert.ok(!message.includes("اللون:"));
  assert.ok(!message.includes("رمز المنتج:"));
  assert.ok(!message.includes("رابط المنتج:"));
  assert.equal(publicProductUrl(product, domain), product.canonicalUrl);
  assert.equal(whatsAppHref("not a number", generalWhatsAppMessage), null);
});
