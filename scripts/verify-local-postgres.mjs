import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const root = path.resolve(import.meta.dirname, "..");
const source = JSON.parse(await fs.readFile(path.join(root, "data", "products.json"), "utf8"));
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const version = (await db.query("SHOW server_version")).rows[0].server_version;
  const counts = {};
  for (const table of ["products", "product_variants", "product_images"]) counts[table] = Number((await db.query(`SELECT COUNT(*) count FROM ${table}`)).rows[0].count);
  const products = (await db.query("SELECT id,featured,featured_sort_position FROM products ORDER BY category_sort_position,id")).rows;
  const variants = (await db.query("SELECT id,product_id,image_id FROM product_variants ORDER BY product_id,id")).rows;
  const images = (await db.query("SELECT id,product_id,sort_position FROM product_images ORDER BY product_id,sort_position,id")).rows;
  const categories = (await db.query("SELECT pc.product_id,c.slug FROM product_categories pc JOIN categories c ON c.id=pc.category_id ORDER BY pc.product_id,c.slug")).rows;
  const banners = (await db.query("SELECT id,status,sort_position,desktop_image_url FROM banners ORDER BY sort_position,id")).rows;
  const migrations = (await db.query("SELECT version FROM schema_migrations ORDER BY version")).rows.map((row) => row.version);

  const variantsById = new Map(variants.map((row) => [row.id, row]));
  const imagesById = new Map(images.map((row) => [row.id, row]));
  const categoriesByProduct = new Map();
  for (const row of categories) categoriesByProduct.set(row.product_id, [...(categoriesByProduct.get(row.product_id) || []), row.slug]);
  const failures = [];
  for (const product of source.products) {
    const databaseImages = images.filter((row) => row.product_id === product.id);
    if (JSON.stringify(databaseImages.map((row) => row.id)) !== JSON.stringify(product.images.map((image) => image.id))) failures.push(`image order: ${product.id}`);
    if (JSON.stringify((categoriesByProduct.get(product.id) || []).sort()) !== JSON.stringify(product.categories.map((category) => category.slug).sort())) failures.push(`categories: ${product.id}`);
    for (const variant of product.variants) {
      const row = variantsById.get(variant.id);
      if (!row || row.product_id !== product.id || row.image_id !== variant.imageId) failures.push(`variant association: ${variant.id}`);
      if (variant.imageId && (!imagesById.has(variant.imageId) || imagesById.get(variant.imageId).product_id !== product.id)) failures.push(`variant image ownership: ${variant.id}`);
    }
  }
  const featured = products.filter((row) => row.featured).sort((a, b) => a.featured_sort_position - b.featured_sort_position).map((row) => row.id);
  const expectedFeatured = source.products.slice(0, 8).map((product) => product.id);
  if (JSON.stringify(featured) !== JSON.stringify(expectedFeatured)) failures.push("featured order");
  if (counts.products !== 34 || counts.product_variants !== 468 || counts.product_images !== 207) failures.push("table counts");
  const seededBanner = banners.find((banner) => banner.id === "00000000-0000-4000-8000-000000000001");
  if (!seededBanner || seededBanner.status !== "published" || seededBanner.sort_position !== 1) failures.push("seeded banner");
  const result = {
    engine: `PostgreSQL ${version}`,
    database: "melyne_dev",
    migrations,
    products: counts.products,
    variants: counts.product_variants,
    images: counts.product_images,
    checkedVariantImageAssociations: source.products.reduce((sum, product) => sum + product.variants.length, 0),
    featuredOrder: featured,
    bannerCount: banners.length,
    seededBanner: seededBanner || null,
    failures,
    result: failures.length ? "FAIL" : "PASS",
  };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await db.end();
}
