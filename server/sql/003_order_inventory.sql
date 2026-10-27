BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_state text NOT NULL DEFAULT 'not_reserved' CHECK (inventory_state IN ('not_reserved','reserved','restored'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_requests (
  idempotency_key uuid PRIMARY KEY,
  request_hash text NOT NULL,
  order_id uuid UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  variant_id text NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  reason text NOT NULL CHECK (reason IN ('order_reserved','order_cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, variant_id, reason),
  CHECK ((reason = 'order_reserved' AND quantity_delta < 0) OR (reason = 'order_cancelled' AND quantity_delta > 0))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_created ON stock_movements(variant_id, created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('003_order_inventory') ON CONFLICT DO NOTHING;
COMMIT;
