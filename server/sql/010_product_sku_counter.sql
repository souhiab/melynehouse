BEGIN;
CREATE TABLE IF NOT EXISTS product_reference_counter (
  name text PRIMARY KEY,
  last_number bigint NOT NULL CHECK(last_number>=0)
);
INSERT INTO product_reference_counter(name,last_number) VALUES('product',0) ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(version) VALUES('010_product_sku_counter') ON CONFLICT DO NOTHING;
COMMIT;
