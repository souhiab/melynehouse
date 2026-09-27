import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { newDb } from "pg-mem";
import { importCatalog } from "../server/import-catalog.mjs";
import { loadProducts } from "../server/catalog-repository.mjs";
import { applyMigrations } from "./admin-test-helpers.mjs";

test("catalog migration preserves all 34 products, 468 variants, 207 images and their associations", async () => {
  const source = JSON.parse(await fs.readFile(path.resolve("data/products.json"), "utf8"));
  const memory = newDb({ autoCreateForeignKeyIndices: true }); const adapter = memory.adapters.createPg(); const db = new adapter.Pool();
  await applyMigrations(db);
  const counts = await importCatalog(db, path.resolve("data/products.json"));
  assert.deepEqual(counts, { products: 34, product_variants: 468, product_images: 207, expectedVariants: 468, expectedImages: 207 });
  const loaded = await loadProducts(db, { includeUnpublished: true });
  assert.equal(loaded.length, 34);
  const sourceById = new Map(source.products.map((product) => [product.id, product]));
  for (const product of loaded) {
    const original = sourceById.get(product.id); assert.ok(original, product.id);
    assert.deepEqual(product.variants.map((variant) => variant.id).sort(), original.variants.map((variant) => variant.id).sort());
    assert.deepEqual(product.images.map((image) => image.id), original.images.map((image) => image.id));
    assert.deepEqual(product.images.map((image) => image.sourceUrl), original.images.map((image) => image.sourceUrl));
    assert.deepEqual(product.variants.map((variant) => variant.imageId).sort(), original.variants.map((variant) => variant.imageId).sort());
    assert.deepEqual(product.categories.map((category) => category.slug).sort(), original.categories.map((category) => category.slug).sort());
  }
  assert.deepEqual(loaded.filter((product) => product.featured).sort((a,b)=>a.featuredOrder-b.featuredOrder).map((product) => product.id), source.products.slice(0,8).map((product) => product.id));
  await assert.rejects(() => importCatalog(db, path.resolve("data/products.json")), /refusing a destructive re-import/);
});

