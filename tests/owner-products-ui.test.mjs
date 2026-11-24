import assert from "node:assert/strict";
import test from "node:test";
import { deriveProductStats, filterOwnerProducts } from "../src/admin/product-stats.js";
import { readSidebarPreference, saveSidebarPreference } from "../src/admin/sidebar-preference.js";
import { buildVariants, optionValuesFromText } from "../src/admin/variant-lifecycle.js";
import { ownerNavigation, ownerPathForTab, ownerSectionForTab, ownerTabFromPath } from "../src/admin/owner-navigation.js";

const product = (id, status, name = id) => ({ id, status, displayName: name, name, sku: `SKU-${id}`, slug: id });

test("owner child routes, parent destinations and planned navigation are explicit", () => {
  assert.equal(ownerTabFromPath("/owner/orders/new"), "new-order");
  assert.equal(ownerSectionForTab("new-order"), "orders");
  assert.equal(ownerPathForTab("new-order"), "/owner/orders/new");
  assert.equal(ownerPathForTab("orders"), "/owner/orders");
  assert.equal(ownerPathForTab("products"), "/owner/products");
  assert.equal(ownerTabFromPath("/owner/products/new"), "add-product");
  assert.equal(ownerTabFromPath("/owner"), "products");
  assert.equal(ownerTabFromPath("/owner/store"), "store");
  assert.equal(ownerTabFromPath("/owner/store/media"), "store-media");
  assert.equal(ownerSectionForTab("store-media"), "store");
  assert.equal(ownerPathForTab("store-pages"), "/owner/store/pages");
  const sections = ownerNavigation.flatMap((group) => group.sections || []);
  assert.deepEqual(sections.map((section) => section.id), ["orders", "products", "marketing", "store"]);
  assert.equal(sections.find(section=>section.id==='store').children.length,6);
  assert.equal(sections[0].path, "/owner/orders");
  assert.equal(sections[0].children[0].path, sections[0].path);
  assert.equal(sections[1].path, "/owner/products");
  assert.equal(sections[1].children[0].path, sections[1].path);
  assert.equal(sections[1].children[1].path, "/owner/products/new");
  assert.deepEqual(sections[0].children.filter((item) => item.planned).map((item) => item.id), ["customers", "payments", "invoices"]);
  assert.ok(sections[0].children.filter((item) => item.planned).every((item) => !item.path));
});

test("removed combinations retire and re-added combinations reuse their original IDs", () => {
  const option = (labels) => [{ id: "color", key: "color", name: "Color", values: labels.map((label) => ({ id: label, label })) }];
  const original = ["Red", "Blue"].map((value) => ({ id: value, name: value, selections: [{ option: "Color", optionKey: "color", value }], priceMad: 100, stockQuantity: 2, available: true, retired: false }));
  const removed = buildVariants(option(["Red"]), original, 100, null);
  assert.equal(removed.find((variant) => variant.id === "Blue").retired, true);
  assert.equal(removed.find((variant) => variant.id === "Blue").available, false);
  const restoredOption = buildVariants(option(["Red", "Blue", "Green"]), removed, 100, null);
  assert.equal(restoredOption.find((variant) => variant.id === "Blue").retired, true);
  assert.equal(restoredOption.find((variant) => variant.id === "Blue").stockQuantity, 2);
  assert.equal(restoredOption.find((variant) => variant.selections[0].value === "Green").id, undefined);
});

test("editing option text preserves exact imported labels and stable value IDs", () => {
  const original = { id: "size-three", label: "3 ans ", secondaryLabel: "3 ans " };
  assert.deepEqual(optionValuesFromText("3 ans , 4 ans", [original], "size"), [original, { id: "size-1", label: "4 ans", secondaryLabel: "4 ans" }]);
});

test("owner totals include archived records and visibility follows the public response", () => {
  const products = [product("a", "published"), product("b", "published"), product("c", "hidden"), product("d", "archived")];
  assert.deepEqual(deriveProductStats(products, [products[0], products[1]]), { total: 4, published: 2, draft: 0, visible: 2, variable: 0 });
  assert.equal(deriveProductStats(products, [products[0]]).visible, 1);
});

test("create, publish and archive update derived counts without a hardcoded total", () => {
  const first = [product("a", "published")];
  assert.equal(deriveProductStats(first, first).total, 1);
  const created = [...first, product("b", "hidden")];
  assert.deepEqual(deriveProductStats(created, first), { total: 2, published: 1, draft: 0, visible: 1, variable: 0 });
  const published = [first[0], { ...created[1], status: "published" }];
  assert.deepEqual(deriveProductStats(published, published), { total: 2, published: 2, draft: 0, visible: 2, variable: 0 });
  const archived = [first[0], { ...published[1], status: "archived" }];
  assert.deepEqual(deriveProductStats(archived, first), { total: 2, published: 1, draft: 0, visible: 1, variable: 0 });
});

test("draft and variable counts follow real product statuses and variants", () => {
  const products = [
    { ...product("a", "draft"), variants: [{ id: "v1" }, { id: "v2" }] },
    { ...product("b", "published"), variants: [{ id: "v3" }] },
    { ...product("c", "archived"), variants: [{ id: "v4" }, { id: "v5" }] },
  ];
  assert.deepEqual(deriveProductStats(products, [products[1]]), { total: 3, published: 1, draft: 1, visible: 1, variable: 1 });
});

test("owner list filters Arabic names, SKU and status", () => {
  const products = [product("a", "published", "فستان أطفال"), product("b", "hidden", "قميص رجالي")];
  assert.deepEqual(filterOwnerProducts(products, "فستان", "all").map((item) => item.id), ["a"]);
  assert.deepEqual(filterOwnerProducts(products, "sku-b", "hidden").map((item) => item.id), ["b"]);
  assert.deepEqual(filterOwnerProducts(products, "", "published").map((item) => item.id), ["a"]);
});

test("sidebar collapse preference survives re-reading and disabled storage", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readSidebarPreference(storage), false);
  saveSidebarPreference(storage, true);
  assert.equal(readSidebarPreference(storage), true);
  saveSidebarPreference(storage, false);
  assert.equal(readSidebarPreference(storage), false);
  assert.equal(readSidebarPreference({ getItem: () => { throw new Error("denied"); } }), false);
  assert.doesNotThrow(() => saveSidebarPreference({ setItem: () => { throw new Error("denied"); } }, true));
});
