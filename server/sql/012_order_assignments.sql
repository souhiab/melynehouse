BEGIN;
CREATE TABLE IF NOT EXISTS order_assignments (
 order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
 assigned_to uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
 assigned_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz,
 confirmed_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS order_assignments_member_date ON order_assignments(assigned_to,assigned_at);
INSERT INTO schema_migrations(version) VALUES('012_order_assignments') ON CONFLICT DO NOTHING;
COMMIT;
