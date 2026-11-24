BEGIN;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'super_admin'
  CHECK (role IN ('super_admin','confirmation','follow_up','products_marketing'));
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_lower ON admin_users(lower(email));
INSERT INTO schema_migrations(version) VALUES ('011_team_roles') ON CONFLICT DO NOTHING;
COMMIT;
