BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'website'
  CHECK (source IN ('website','whatsapp','instagram','facebook','other'));

INSERT INTO schema_migrations(version) VALUES ('006_order_sources') ON CONFLICT DO NOTHING;
COMMIT;
