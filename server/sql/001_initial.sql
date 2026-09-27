BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT 'MELYNE owner',
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  sku text,
  slug text NOT NULL UNIQUE,
  original_name text NOT NULL,
  display_name text NOT NULL,
  description text,
  description_html text,
  price_mad numeric(12,2) NOT NULL CHECK (price_mad >= 0),
  comparison_price_mad numeric(12,2) CHECK (comparison_price_mad IS NULL OR comparison_price_mad >= price_mad),
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available','unavailable')),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','archived')),
  category_sort_position integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  featured_sort_position integer,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  category_id text NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE IF NOT EXISTS product_images (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  storage_key text NOT NULL,
  public_url text NOT NULL,
  original_public_url text,
  alt_text text NOT NULL DEFAULT '',
  sort_position integer NOT NULL DEFAULT 0,
  content_type text,
  byte_size bigint,
  checksum_sha256 text,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, sort_position)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  name text NOT NULL,
  selections jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_mad numeric(12,2) NOT NULL CHECK (price_mad >= 0),
  comparison_price_mad numeric(12,2) CHECK (comparison_price_mad IS NULL OR comparison_price_mad >= price_mad),
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  available boolean NOT NULL DEFAULT true,
  image_id text REFERENCES product_images(id) ON DELETE SET NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY,
  heading_ar text NOT NULL,
  supporting_text_ar text,
  button_label_ar text,
  destination_url text,
  desktop_image_url text NOT NULL,
  mobile_image_url text,
  image_alt_ar text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  sort_position integer NOT NULL DEFAULT 0,
  active_from timestamptz,
  active_until timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (active_until IS NULL OR active_from IS NULL OR active_until > active_from)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','preparing','shipped','delivered','cancelled')),
  currency text NOT NULL DEFAULT 'MAD' CHECK (currency = 'MAD'),
  subtotal_mad numeric(12,2) NOT NULL CHECK (subtotal_mad >= 0),
  total_mad numeric(12,2) NOT NULL CHECK (total_mad >= 0),
  customer jsonb NOT NULL,
  customer_note text,
  sheet_sync_status text NOT NULL DEFAULT 'pending' CHECK (sheet_sync_status IN ('pending','synced','failed','disabled')),
  sheet_sync_error text,
  sheet_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id text REFERENCES products(id) ON DELETE SET NULL,
  variant_id text REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_mad numeric(12,2) NOT NULL CHECK (unit_price_mad >= 0),
  product_snapshot jsonb NOT NULL,
  variant_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_public_order ON products(status, category_sort_position, id);
CREATE INDEX IF NOT EXISTS idx_products_featured_order ON products(status, featured, featured_sort_position, id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id, product_id);
CREATE INDEX IF NOT EXISTS idx_banners_public_order ON banners(status, sort_position, id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('001_initial') ON CONFLICT DO NOTHING;
COMMIT;
