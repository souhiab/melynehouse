import assert from "node:assert/strict";
import test from "node:test";
import { ORDER_SOURCES, ORDER_STATUSES, ORDER_TRANSITIONS, customerField, itemSelection, lineTotal, productName, selectionValue, sourceLabel, statusLabel } from "../src/admin/order-view-model.js";

test("order status presentation has the required fixed sequence and permitted transitions", () => {
  assert.deepEqual(ORDER_STATUSES.map((item) => item.id), ["new", "no_response", "confirmed", "preparing", "shipped", "delivered", "cancelled"]);
  assert.deepEqual(ORDER_STATUSES.map((item) => item.label), ["قيد الانتظار", "لا يرد", "مؤكد", "قيد التجهيز", "تم الشحن", "تم التوصيل", "ملغى"]);
  assert.deepEqual(ORDER_TRANSITIONS.new, ["no_response", "confirmed", "cancelled"]);
  assert.deepEqual(ORDER_TRANSITIONS.cancelled, []);
  assert.equal(statusLabel("no_response"), "لا يرد");
});

test("order source labels include legacy unknown without inventing website provenance", () => {
  assert.deepEqual(ORDER_SOURCES.map((item) => item.id), ["website", "whatsapp", "instagram", "facebook", "tiktok", "phone", "other", "unknown"]);
  assert.equal(sourceLabel("unknown"), "غير معروف / قديم");
  assert.equal(sourceLabel(null), "غير معروف / قديم");
});

test("historical item snapshots supply exact size, color, name and line total", () => {
  const item = { productSnapshot: { originalName: "الاسم الأصلي", displayName: "اسم البطاقة" }, variantSnapshot: { selections: [
    { option: "Color", value: "P34-Black" }, { option: "Size", value: "5-6 ans" },
  ] }, quantity: 2, unitPriceMad: 149.98 };
  assert.equal(productName(item), "الاسم الأصلي");
  assert.equal(selectionValue(item, "size"), "5-6 ans");
  assert.equal(selectionValue(item, "color"), "P34-Black");
  assert.equal(lineTotal(item), 299.96);
  assert.equal(productName({ productSnapshot: { displayName: "اسم قديم" } }), "اسم قديم");
  assert.equal(selectionValue({ variantSnapshot: { selections: [] } }, "color"), null);
});

test("saved customer fields remain exact and missing history has an Arabic fallback", () => {
  const order = { customer: { name: "أمينة العلمي", city: "Casablanca", phone: "+212 6 12 34 56 78" } };
  assert.equal(customerField(order, "name"), "أمينة العلمي");
  assert.equal(customerField(order, "city"), "Casablanca");
  assert.equal(customerField(order, "phone"), "+212 6 12 34 56 78");
  assert.equal(customerField({ customer: {} }, "phone"), "غير متوفر");
  assert.equal(customerField(order, "address"), "غير متوفر");
});

test("multi-item table summaries do not assign the first item's options to all products", () => {
  const first = { variantSnapshot: { selections: [{ option: "Size", value: "M" }, { option: "Color", value: "أزرق" }] } };
  assert.equal(itemSelection({ items: [first] }, "size"), "M");
  assert.equal(itemSelection({ items: [first, { variantSnapshot: { selections: [] } }] }, "size"), "متعدد — انظر التفاصيل");
  assert.equal(itemSelection({ items: [] }, "color"), "غير متوفر");
});
