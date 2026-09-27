import crypto from "node:crypto";
import { transaction } from "./db.mjs";

const numberOrNull = (value) => value == null ? null : Number(value);

export async function loadProducts(db, { includeUnpublished = false } = {}) {
  const productResult = await db.query(`
    SELECT p.* FROM products p
    ${includeUnpublished ? "" : "WHERE p.status = 'published'"}
    ORDER BY p.category_sort_position ASC, p.id ASC`);
  const ids = productResult.rows.map((row) => row.id);
  if (!ids.length) return [];
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(",");
  const [categoryResult, imageResult, variantResult] = await Promise.all([
    db.query(`SELECT pc.product_id, pc.sort_position, c.id, c.slug, c.name FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id IN (${placeholders}) ORDER BY c.sort_position,c.id`, ids),
    db.query(`SELECT * FROM product_images WHERE product_id IN (${placeholders}) AND archived_at IS NULL ORDER BY sort_position,id`, ids),
    db.query(`SELECT * FROM product_variants WHERE product_id IN (${placeholders}) ORDER BY id`, ids),
  ]);
  return productResult.rows.map((row) => ({
    ...(row.source_metadata || {}),
    id: row.id, sku: row.sku, slug: row.slug, name: row.original_name, displayName: row.display_name,
    description: row.description, descriptionHtml: row.description_html,
    price: { current: Number(row.price_mad), comparison: numberOrNull(row.comparison_price_mad), currency: "MAD" },
    availability: row.availability, status: row.status, order: row.category_sort_position,
    featured: row.featured, featuredOrder: row.featured_sort_position, options: row.options || [],
    categories: categoryResult.rows.filter((item) => item.product_id === row.id).map(({ id, slug, name, sort_position }) => ({ id, slug, name, sortPosition: Number(sort_position) })),
    categoryPositions: Object.fromEntries(categoryResult.rows.filter((item) => item.product_id === row.id).map((item) => [item.slug, Number(item.sort_position)])),
    images: imageResult.rows.filter((item) => item.product_id === row.id).map((item) => ({
      id: item.id, localOptimizedPath: item.public_url, localOriginalPath: item.original_public_url || item.public_url,
      sourceUrl: item.source_metadata?.sourceUrl || item.public_url, altText: item.alt_text, order: item.sort_position,
    })),
    variants: variantResult.rows.filter((item) => item.product_id === row.id).map((item) => ({
      id: item.id, name: item.name, selections: item.selections || [],
      price: { current: Number(item.price_mad), comparison: numberOrNull(item.comparison_price_mad), currency: "MAD" },
      stockQuantity: item.stock_quantity, availability: item.available ? "available" : "unavailable", imageId: item.image_id,
    })),
    sourceMetadata: row.source_metadata || {}, archivedAt: row.archived_at,
  }));
}

export async function saveProduct(db, input, productId = input.id || crypto.randomUUID()) {
  return transaction(db, async (client) => {
    const isFeatured = input.featured && input.status !== "archived";
    const existing = await client.query("SELECT category_sort_position,featured_sort_position FROM products WHERE id=$1", [productId]);
    const next = existing.rowCount ? existing.rows[0] : (await client.query("SELECT COALESCE(MAX(category_sort_position),0)+1 AS position FROM products")).rows[0];
    let featuredPosition = null;
    if (isFeatured) {
      featuredPosition = existing.rows[0]?.featured_sort_position;
      if (featuredPosition == null) featuredPosition = Number((await client.query("SELECT COALESCE(MAX(featured_sort_position),0)+1 AS position FROM products WHERE archived_at IS NULL")).rows[0].position);
    }
    await client.query(`INSERT INTO products(id,sku,slug,original_name,display_name,description,description_html,price_mad,comparison_price_mad,availability,status,category_sort_position,featured,featured_sort_position,options,archived_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
      ON CONFLICT(id) DO UPDATE SET sku=EXCLUDED.sku,slug=EXCLUDED.slug,original_name=EXCLUDED.original_name,display_name=EXCLUDED.display_name,description=EXCLUDED.description,description_html=EXCLUDED.description_html,price_mad=EXCLUDED.price_mad,comparison_price_mad=EXCLUDED.comparison_price_mad,availability=EXCLUDED.availability,status=EXCLUDED.status,featured=EXCLUDED.featured,featured_sort_position=EXCLUDED.featured_sort_position,options=EXCLUDED.options,archived_at=EXCLUDED.archived_at,updated_at=now()`,
      [productId,input.sku||null,input.slug,input.originalName,input.displayName,input.description||null,input.descriptionHtml||null,input.priceMad,input.comparisonPriceMad??null,input.availability,input.status,Number(next.category_sort_position||next.position),isFeatured,featuredPosition,JSON.stringify(input.options||[]),input.status==="archived"?new Date():null]);
    const retainedCategoryIds = [];
    for (const slug of input.categorySlugs) {
      const category = await client.query("SELECT id FROM categories WHERE slug=$1", [slug]);
      if (!category.rowCount) { const error = new Error(`Unknown category: ${slug}`); error.status = 400; throw error; }
      const categoryId = category.rows[0].id; retainedCategoryIds.push(categoryId);
      const currentPosition = await client.query("SELECT sort_position FROM product_categories WHERE product_id=$1 AND category_id=$2", [productId,categoryId]);
      const position = currentPosition.rowCount ? Number(currentPosition.rows[0].sort_position) : Number((await client.query("SELECT COALESCE(MAX(sort_position),0)+1 AS position FROM product_categories WHERE category_id=$1",[categoryId])).rows[0].position);
      await client.query("INSERT INTO product_categories(product_id,category_id,sort_position) VALUES($1,$2,$3) ON CONFLICT(product_id,category_id) DO UPDATE SET sort_position=EXCLUDED.sort_position", [productId,categoryId,position]);
    }
    await client.query("DELETE FROM product_categories WHERE product_id=$1 AND NOT(category_id = ANY($2::text[]))", [productId,retainedCategoryIds]);
    const retained = [];
    for (const variant of input.variants || []) {
      const variantId = variant.id || crypto.randomUUID(); retained.push(variantId);
      const priorVariant = await client.query("SELECT product_id FROM product_variants WHERE id=$1",[variantId]);
      if (priorVariant.rowCount && priorVariant.rows[0].product_id !== productId) { const error=new Error("A variant ID belongs to another product"); error.status=400; throw error; }
      if (variant.imageId) {
        const image = await client.query("SELECT id FROM product_images WHERE id=$1 AND product_id=$2 AND archived_at IS NULL",[variant.imageId,productId]);
        if (!image.rowCount) { const error=new Error("A variant image must belong to the same product"); error.status=400; throw error; }
      }
      await client.query(`INSERT INTO product_variants(id,product_id,name,selections,price_mad,comparison_price_mad,stock_quantity,available,image_id,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,selections=EXCLUDED.selections,price_mad=EXCLUDED.price_mad,comparison_price_mad=EXCLUDED.comparison_price_mad,stock_quantity=EXCLUDED.stock_quantity,available=EXCLUDED.available,image_id=EXCLUDED.image_id,updated_at=now()`,
        [variantId,productId,variant.name,JSON.stringify(variant.selections),variant.priceMad,variant.comparisonPriceMad??null,variant.stockQuantity??null,variant.available,variant.imageId??null]);
    }
    if (retained.length) await client.query("DELETE FROM product_variants WHERE product_id=$1 AND NOT(id = ANY($2::text[]))", [productId,retained]);
    else await client.query("DELETE FROM product_variants WHERE product_id=$1", [productId]);
    return productId;
  });
}

export async function reorderProducts(db, scope, orderedIds, categorySlug = null) {
  if (!Array.isArray(orderedIds) || new Set(orderedIds).size !== orderedIds.length) { const error = new Error("Product ordering must contain unique IDs"); error.status=400; throw error; }
  await transaction(db, async (client) => {
    if (scope === "featured") {
      const allowed = await client.query("SELECT id FROM products WHERE archived_at IS NULL");
      const allowedIds = new Set(allowed.rows.map((row)=>row.id));
      if (orderedIds.some((id)=>!allowedIds.has(id))) { const error=new Error("Featured ordering contains an unknown or archived product"); error.status=400; throw error; }
      await client.query("UPDATE products SET featured=false,featured_sort_position=NULL");
      for (let i=0;i<orderedIds.length;i+=1) await client.query("UPDATE products SET featured=true,featured_sort_position=$1,updated_at=now() WHERE id=$2", [i+1,orderedIds[i]]);
      return;
    }
    if (scope !== "category" || !categorySlug) { const error=new Error("Invalid ordering scope"); error.status=400; throw error; }
    const category = await client.query("SELECT id FROM categories WHERE slug=$1",[categorySlug]);
    if (!category.rowCount) { const error=new Error("Unknown category"); error.status=400; throw error; }
    const allowed = await client.query("SELECT pc.product_id FROM product_categories pc JOIN products p ON p.id=pc.product_id WHERE pc.category_id=$1 AND p.archived_at IS NULL", [category.rows[0].id]);
    const allowedIds = new Set(allowed.rows.map((row)=>row.product_id));
    if (orderedIds.length!==allowedIds.size || orderedIds.some((id)=>!allowedIds.has(id))) { const error=new Error("Category ordering must include every non-archived product in the selected category exactly once"); error.status=400; throw error; }
    for (let i=0;i<orderedIds.length;i+=1) await client.query("UPDATE product_categories SET sort_position=$1 WHERE product_id=$2 AND category_id=$3", [i+1,orderedIds[i],category.rows[0].id]);
  });
}

