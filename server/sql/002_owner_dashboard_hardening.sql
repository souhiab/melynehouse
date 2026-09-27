BEGIN;

ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS sort_position integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_product_categories_order
  ON product_categories(category_id, sort_position, product_id);

CREATE TABLE IF NOT EXISTS upload_assets (
  id uuid PRIMARY KEY,
  storage_key text NOT NULL UNIQUE,
  public_url text NOT NULL UNIQUE,
  original_name text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  checksum_sha256 text NOT NULL,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY,
  admin_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
  ON admin_audit_log(created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('002_owner_dashboard_hardening')
ON CONFLICT DO NOTHING;

COMMIT;
