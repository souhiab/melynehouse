import fs from "node:fs/promises";
import path from "node:path";
import { transaction } from "./db.mjs";

export async function importCatalog(db, catalogPath, { allowUpdate = false } = {}) {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  if (catalog.products?.length !== 34) throw new Error(`Expected the preserved 34-product snapshot, found ${catalog.products?.length || 0}`);
  const expectedVariants = catalog.products.reduce((sum, product) => sum + product.variants.length, 0);
  const expectedImages = catalog.products.reduce((sum, product) => sum + product.images.length, 0);
  return transaction(db, async (client) => {
    const current = Number((await client.query("SELECT COUNT(*) AS count FROM products")).rows[0].count);
    if (current && !allowUpdate) throw new Error(`Catalog already contains ${current} products; refusing a destructive re-import`);
    const categories = new Map();
    for (const product of catalog.products) for (const category of product.categories) categories.set(category.slug, category);
    let categoryPosition = 0;
    for (const category of categories.values()) {
      categoryPosition += 1;
      await client.query(`INSERT INTO categories(id,slug,name,sort_position) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name`, [category.id,category.slug,category.name,categoryPosition]);
    }
    const categoryPositions = new Map();
    for (const [index, product] of catalog.products.entries()) {
      const meta = { canonicalUrl: product.canonicalUrl, sourceUrl: product.sourceUrl, brand: product.brand, tags: product.tags, productType: product.productType, createdAt: product.createdAt, updatedAt: product.updatedAt, extractedAt: product.extractedAt, source: product.source };
      await client.query(`INSERT INTO products(id,sku,slug,original_name,display_name,description,description_html,price_mad,comparison_price_mad,availability,status,category_sort_position,featured,featured_sort_position,options,source_metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published',$11,$12,$13,$14,$15)
        ON CONFLICT(id) DO UPDATE SET sku=EXCLUDED.sku,slug=EXCLUDED.slug,original_name=EXCLUDED.original_name,display_name=EXCLUDED.display_name,description=EXCLUDED.description,description_html=EXCLUDED.description_html,price_mad=EXCLUDED.price_mad,comparison_price_mad=EXCLUDED.comparison_price_mad,availability=EXCLUDED.availability,options=EXCLUDED.options,source_metadata=EXCLUDED.source_metadata,updated_at=now()`,
        [product.id,product.sku,product.slug,product.name,product.displayName,product.description,product.descriptionHtml,product.price.current,product.price.comparison,product.availability,product.order||index+1,index<8,index<8?index+1:null,JSON.stringify(product.options),JSON.stringify(meta)]);
      for (const category of product.categories) {
        const position=(categoryPositions.get(category.id)||0)+1; categoryPositions.set(category.id,position);
        await client.query("INSERT INTO product_categories(product_id,category_id,sort_position) VALUES($1,$2,$3) ON CONFLICT(product_id,category_id) DO UPDATE SET sort_position=EXCLUDED.sort_position", [product.id,category.id,position]);
      }
      for (const [imageIndex,image] of product.images.entries()) await client.query(`INSERT INTO product_images(id,product_id,storage_key,public_url,original_public_url,alt_text,sort_position,source_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`, [image.id,product.id,image.localOptimizedPath,image.localOptimizedPath,image.localOriginalPath,product.displayName,imageIndex+1,JSON.stringify(image)]);
      for (const variant of product.variants) await client.query(`INSERT INTO product_variants(id,product_id,name,selections,price_mad,comparison_price_mad,stock_quantity,available,image_id,source_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`, [variant.id,product.id,variant.name,JSON.stringify(variant.selections),variant.price.current,variant.price.comparison,Number.isInteger(variant.stockQuantity)&&variant.stockQuantity>=0?variant.stockQuantity:null,variant.availability==="available",variant.imageId,JSON.stringify({ availabilitySource: variant.availabilitySource, explicitlyUnavailable: variant.explicitlyUnavailable, importedStockQuantity: variant.stockQuantity })]);
    }
    const counts = {};
    for (const table of ["products","product_variants","product_images"]) counts[table] = Number((await client.query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count);
    if (counts.products!==34 || counts.product_variants!==expectedVariants || counts.product_images!==expectedImages) throw new Error(`Migration count mismatch: ${JSON.stringify(counts)}`);
    await client.query(`INSERT INTO banners(id,heading_ar,supporting_text_ar,button_label_ar,destination_url,desktop_image_url,mobile_image_url,image_alt_ar,status,sort_position)
      VALUES('00000000-0000-4000-8000-000000000001','إطلالات لكل العائلة','أزياء عصرية ومريحة للنساء والرجال والأطفال بأسلوب مغربي عصري','تسوق الآن','/shop','/images/reference/hero-family-web.jpg',NULL,'عائلة ترتدي أزياء MELYNE','published',1)
      ON CONFLICT(id) DO NOTHING`);
    return { ...counts, expectedVariants, expectedImages };
  });
}

