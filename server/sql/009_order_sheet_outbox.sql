BEGIN;

CREATE TABLE IF NOT EXISTS order_sheet_outbox (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type='melyne.cod_order.created'),
  schema_version integer NOT NULL CHECK (schema_version=1),
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','delivered','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  attempt_limit integer NOT NULL DEFAULT 8 CHECK (attempt_limit>0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  delivery_receipt jsonb,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,event_type),
  CHECK ((state='processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (state<>'processing' AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK (state<>'delivered' OR (delivery_receipt IS NOT NULL AND delivered_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_sheet_outbox_due ON order_sheet_outbox(next_attempt_at,id) WHERE state='pending';
CREATE INDEX IF NOT EXISTS idx_sheet_outbox_expired ON order_sheet_outbox(lease_until) WHERE state='processing';

CREATE TABLE IF NOT EXISTS order_sheet_attempts (
  event_id uuid NOT NULL REFERENCES order_sheet_outbox(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL,
  lease_token uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text NOT NULL DEFAULT 'processing' CHECK (outcome IN ('processing','delivered','retrying','failed','lease_expired')),
  http_status integer,
  error_code text,
  PRIMARY KEY(event_id,attempt_number)
);

-- REAL_POSTGRES_ONLY_START
CREATE OR REPLACE FUNCTION protect_order_sheet_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order sync events must be retained'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Order sync event identity and payload are immutable';
  END IF;
  IF OLD.state='delivered' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Delivered order sync events are immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_order_sheet_event ON order_sheet_outbox;
CREATE TRIGGER protect_order_sheet_event BEFORE UPDATE OR DELETE ON order_sheet_outbox
  FOR EACH ROW EXECUTE FUNCTION protect_order_sheet_event();
-- REAL_POSTGRES_ONLY_END

INSERT INTO schema_migrations(version) VALUES ('009_order_sheet_outbox') ON CONFLICT DO NOTHING;
COMMIT;
