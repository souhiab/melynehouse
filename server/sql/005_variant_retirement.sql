BEGIN;

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS retired_at timestamptz;

INSERT INTO schema_migrations(version) VALUES ('005_variant_retirement') ON CONFLICT DO NOTHING;
COMMIT;
