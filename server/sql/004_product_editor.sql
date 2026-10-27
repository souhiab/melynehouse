BEGIN;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('draft','published','hidden','archived'));

ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_mad numeric(12,2)
  CHECK (cost_price_mad IS NULL OR cost_price_mad >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_text text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_color text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg numeric(10,3)
  CHECK (weight_kg IS NULL OR weight_kg >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width_cm numeric(10,2)
  CHECK (width_cm IS NULL OR width_cm >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_cm numeric(10,2)
  CHECK (height_cm IS NULL OR height_cm >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS depth_cm numeric(10,2)
  CHECK (depth_cm IS NULL OR depth_cm >= 0);

INSERT INTO schema_migrations(version) VALUES ('004_product_editor') ON CONFLICT DO NOTHING;
COMMIT;
