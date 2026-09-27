import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(await readFile(path.join(root, 'data', 'products.json'), 'utf8'));

assert.equal(catalog.schemaVersion, 1, 'Unexpected catalog schema version');
assert.equal(catalog.currency, 'MAD', 'Catalog currency must remain MAD');
assert.equal(catalog.productCount, catalog.products.length, 'productCount does not match products[]');
assert.equal(catalog.liveCatalogCount, catalog.productCount, 'Imported count differs from live catalog count');

const ids = new Set();
const canonicalUrls = new Set();
const categoryCounts = new Map();
let originalImages = 0;
let optimizedImages = 0;
let variants = 0;
let unavailableVariants = 0;
let missingDescriptions = 0;

for (const product of catalog.products) {
  assert.ok(product.id, 'A product is missing its stable ID');
  assert.ok(!ids.has(product.id), `Duplicate product ID: ${product.id}`);
  ids.add(product.id);

  assert.match(product.canonicalUrl, /^https:\/\/melynehouse\.com\/products\//);
  assert.ok(!canonicalUrls.has(product.canonicalUrl), `Duplicate canonical URL: ${product.canonicalUrl}`);
  canonicalUrls.add(product.canonicalUrl);

  assert.ok(product.name, `${product.id} is missing its original product name`);
  assert.ok(product.displayName, `${product.id} is missing its card displayName`);
  assert.equal(product.price.currency, 'MAD', `${product.id} has a non-MAD price`);
  assert.ok(Number.isFinite(product.price.current), `${product.id} has an invalid current price`);
  if (product.description === null) missingDescriptions += 1;

  assert.ok(product.categories.length > 0, `${product.id} has no category association`);
  for (const category of product.categories) {
    categoryCounts.set(category.slug, (categoryCounts.get(category.slug) ?? 0) + 1);
  }

  const optionValues = new Map(
    product.options.map((option) => [option.name, new Set(option.values.map((value) => value.label))]),
  );

  for (const variant of product.variants) {
    variants += 1;
    assert.ok(['available', 'unavailable', 'unknown'].includes(variant.availability));
    if (variant.availability === 'unavailable') unavailableVariants += 1;
    for (const selection of variant.selections) {
      assert.ok(optionValues.get(selection.option)?.has(selection.value),
        `${product.id}/${variant.id} references an unknown option value`);
    }
  }

  assert.ok(product.images.length > 0, `${product.id} has no product images`);
  for (const [index, image] of product.images.entries()) {
    assert.equal(image.order, index + 1, `${product.id} image order is not contiguous`);
    assert.match(image.sourceUrl, /^https:\/\//, `${product.id} has an invalid source image URL`);

    for (const [kind, localPath] of [
      ['original', image.localOriginalPath],
      ['optimized', image.localOptimizedPath],
    ]) {
      assert.ok(localPath?.startsWith('/images/'), `${product.id} has an invalid ${kind} image path`);
      await access(path.join(root, 'public', localPath.slice(1)));
      if (kind === 'original') originalImages += 1;
      else optimizedImages += 1;
    }
  }
}

assert.deepEqual(
  Object.fromEntries([...categoryCounts.entries()].sort()),
  { kids: 27, women: 4, 'ملابس-رجالية': 3 },
  'Category counts differ from the live catalog',
);

console.log(JSON.stringify({
  extractedAt: catalog.extractedAt,
  liveCatalogCount: catalog.liveCatalogCount,
  importedProducts: catalog.productCount,
  categoryCounts: Object.fromEntries(categoryCounts),
  variants,
  unavailableVariants,
  originalImages,
  optimizedImages,
  missingDescriptions,
  result: 'PASS',
}, null, 2));
