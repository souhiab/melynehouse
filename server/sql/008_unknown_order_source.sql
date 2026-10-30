BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check
  CHECK (source IN ('website','whatsapp','instagram','facebook','tiktok','phone','other','unknown'));

-- Migration 006 assigned "website" by default to orders that predated source tracking.
-- Only those older rows are relabelled; later genuine website orders stay unchanged.
UPDATE orders SET source='unknown'
WHERE source='website' AND created_at < (
  SELECT applied_at FROM schema_migrations WHERE version='006_order_sources'
);

INSERT INTO schema_migrations(version) VALUES ('008_unknown_order_source') ON CONFLICT DO NOTHING;
COMMIT;
