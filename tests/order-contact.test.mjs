import assert from "node:assert/strict";
import test from "node:test";
import { customerWhatsAppHref, normalizeCustomerWhatsAppPhone, orderConfirmationMessage } from "../src/admin/order-contact.js";

const domain = "https://melynehouse.com";
const item = (id, name, color, size, quantity) => ({
  productSnapshot: { id, originalName: name },
  variantSnapshot: { selections: [{ option: "Color", value: color }, { option: "Size", value: size }] },
  quantity,
});

test("Moroccan local and international contact numbers normalize without guessing other country codes", () => {
  assert.equal(normalizeCustomerWhatsAppPhone("06 12 34 56 78"), "212612345678");
  assert.equal(normalizeCustomerWhatsAppPhone("+212 (6) 12-34-56-78"), "212612345678");
  assert.equal(normalizeCustomerWhatsAppPhone("00212 6 12 34 56 78"), "212612345678");
  assert.equal(normalizeCustomerWhatsAppPhone("212612345678"), "212612345678");
  assert.equal(normalizeCustomerWhatsAppPhone("+33 6 12 34 56 78"), "33612345678");
  assert.equal(normalizeCustomerWhatsAppPhone("061234567"), null);
  assert.equal(normalizeCustomerWhatsAppPhone("612345678"), null);
  assert.equal(normalizeCustomerWhatsAppPhone("+000000000"), null);
  assert.equal(normalizeCustomerWhatsAppPhone("06 12 34 56 78 ext 2"), null);
  assert.equal(normalizeCustomerWhatsAppPhone(null), null);
});

test("single-item confirmation uses saved name, variant and quantity with a verified public URL", () => {
  const order = { order_number: "MLY-TEST-1", customer: { name: "أمينة", phone: "0612345678" }, items: [item("p1", "فستان أطفال", "أزرق", "5-6 ans", 2)] };
  const products = [{ id: "p1", status: "published", canonicalUrl: `${domain}/products/children-dress` }];
  const message = orderConfirmationMessage(order, products, domain);
  assert.match(message, /^السلام عليكم أمينة،/);
  assert.match(message, /طلبكم رقم MLY-TEST-1/);
  assert.match(message, /المنتج: فستان أطفال\nاللون: أزرق\nالمقاس: 5-6 ans\nالكمية: 2/);
  assert.match(message, /رابط المنتج: https:\/\/melynehouse\.com\/products\/children-dress/);
  const href = customerWhatsAppHref(order, products, domain);
  assert.equal(new URL(href).hostname, "wa.me");
  assert.equal(new URL(href).pathname, "/212612345678");
  assert.equal(new URL(href).searchParams.get("text"), message);
});

test("multiple historical items retain their own details and omit unavailable links", () => {
  const order = { order_number: "MLY-TEST-2", customer: { name: "Client Test", phone: "+33612345678" }, items: [
    item("retired", "منتج قديم", "أسود", "M", 1),
    item("live", "طقم جديد", "أبيض", "L", 3),
  ] };
  const products = [
    { id: "retired", status: "archived", canonicalUrl: `${domain}/products/retired` },
    { id: "live", status: "published", canonicalUrl: `${domain}/products/live` },
  ];
  const message = orderConfirmationMessage(order, products, domain);
  assert.match(message, /1\. المنتج: منتج قديم\nاللون: أسود\nالمقاس: M\nالكمية: 1/);
  assert.match(message, /2\. المنتج: طقم جديد\nاللون: أبيض\nالمقاس: L\nالكمية: 3/);
  assert.doesNotMatch(message, /products\/retired/);
  assert.match(message, /products\/live/);
  assert.equal(new URL(customerWhatsAppHref(order, products, domain)).pathname, "/33612345678");
});

test("missing details and unsafe or localhost product URLs are omitted", () => {
  const order = { order_number: "MLY-TEST-3", customer: { phone: "not a number" }, items: [{ productSnapshot: { id: "p1" }, variantSnapshot: { selections: [] }, quantity: 1 }] };
  const products = [{ id: "p1", status: "published", canonicalUrl: "http://localhost:5173/products/test" }];
  const message = orderConfirmationMessage(order, products, domain);
  assert.match(message, /^السلام عليكم،/);
  assert.doesNotMatch(message, /غير متوفر|المنتج:|اللون:|المقاس:|رابط المنتج:/);
  assert.equal(customerWhatsAppHref(order, products, domain), null);
});
