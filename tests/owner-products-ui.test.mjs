import assert from "node:assert/strict";
import test from "node:test";
import { deriveProductStats, filterOwnerProducts } from "../src/admin/product-stats.js";
import { readSidebarPreference, saveSidebarPreference } from "../src/admin/sidebar-preference.js";

const product = (id, status, name = id) => ({ id, status, displayName: name, name, sku: `SKU-${id}`, slug: id });

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
