BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false;

-- Earlier owner-created orders have an audit entry even when their source is "website".
UPDATE orders SET created_by_admin=true
WHERE created_by_admin=false AND id::text IN (
  SELECT entity_id FROM admin_audit_log
  WHERE action='create_manual_order' AND entity_type='order' AND entity_id IS NOT NULL
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new','confirmed','no_response','preparing','shipped','delivered','cancelled'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check
  CHECK (source IN ('website','whatsapp','instagram','facebook','tiktok','phone','other'));

INSERT INTO schema_migrations(version) VALUES ('007_order_management_compatibility') ON CONFLICT DO NOTHING;
COMMIT;
