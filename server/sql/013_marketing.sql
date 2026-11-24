BEGIN;
CREATE TABLE IF NOT EXISTS marketing_settings (
 module text PRIMARY KEY,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS product_reviews (
 id uuid PRIMARY KEY,
 product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 author_name text NOT NULL,
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 body text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 moderated_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 moderated_at timestamptz
);
CREATE INDEX IF NOT EXISTS product_reviews_product_status ON product_reviews(product_id,status,created_at);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_mad numeric(12,2) NOT NULL DEFAULT 0 CHECK(discount_mad>=0);
INSERT INTO schema_migrations(version) VALUES('013_marketing') ON CONFLICT DO NOTHING;
COMMIT;
