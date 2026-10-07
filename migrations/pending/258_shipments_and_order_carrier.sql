-- 258_shipments_and_order_carrier.sql
--
-- Where a carrier label and its tracking live, and where the shopper's
-- carrier choice lands on the order. STEP 43.
--
-- WHAT IS TRUE TODAY, MEASURED 2026-10-08 ON PRODUCTION
--
-- `order_items` carries `carrier`, `tracking_number` and `shipped_at` (155);
-- 12 physical lines exist and 0 of them have a tracking number. `shipping_zones`
-- (197) exists with its five free rows and nothing read it until this step.
-- There is no table for a shipment as a thing of its own: no label, no carrier
-- cost, no event history, no last-poll time. `orders` has no carrier column.
--
-- WHY A TABLE AND NOT MORE COLUMNS ON order_items
--
-- One label can cover several lines of one order (the parcel is the unit the
-- courier bills), its events arrive over days, and the carrier's cost is a
-- platform expense that must never be confused with what the shopper paid.
-- Three of those do not fit a line, and the fourth must not sit next to the
-- shopper's money columns.
--
-- THE CODE RUNS WITHOUT THIS FILE. `src/server/shipping/shipments.ts` writes
-- `order_items.carrier` / `tracking_number` (which exist) FIRST and only then
-- inserts here; a 42P01 / PGRST205 on the insert is logged as
-- `shipments.table_missing` and the label is still returned to the admin, the
-- line is still shipped, the customer is still mailed. What is lost until this
-- is applied is the event history and the carrier cost, and the account page
-- falls back to the two-step timeline the line itself supports.
-- Likewise checkout writes `orders.shipping_carrier` in its own UPDATE and
-- treats 42703 as "not yet"; the choice also lands in `orders.notes` as a line
-- the supplier can read today.
--
-- MONEY IS AGOROT, INTEGER. `carrier_cost_agorot` is what the courier bills the
-- platform; `shopper_agorot` is what the shopper was charged for shipping
-- (0 under every zone row today). Both non-negative.
--
-- Idempotent: safe to re-run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.shipments;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS shipping_carrier;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS shipping_service;

-- ------------------------------------------------------------- orders choice

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_carrier text
    CHECK (shipping_carrier IS NULL OR shipping_carrier IN ('israel_post', 'chita', 'yamit'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_service text
    CHECK (shipping_service IS NULL OR char_length(shipping_service) <= 40);

COMMENT ON COLUMN public.orders.shipping_carrier IS
  'The API carrier the shopper picked at checkout (lib/shipping/carrier-registry.ts). NULL: no preference, the admin chooses at label time.';
COMMENT ON COLUMN public.orders.shipping_service IS
  'The carrier service code picked at checkout, e.g. registered / express. Meaningful only with shipping_carrier.';

-- --------------------------------------------------------------- shipments

CREATE TABLE IF NOT EXISTS public.shipments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  carrier_id            text NOT NULL CHECK (carrier_id IN ('israel_post', 'chita', 'yamit')),
  service_code          text NOT NULL CHECK (char_length(service_code) <= 40),
  -- 'mock' or 'http': which adapter produced the label, so a reader of a
  -- KEMOCK-* number knows no courier was ever called.
  provider_kind         text NOT NULL CHECK (provider_kind IN ('mock', 'http')),
  status                text NOT NULL DEFAULT 'label_created'
    CHECK (status IN ('label_created', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned', 'cancelled')),
  tracking_number       text NOT NULL,
  provider_shipment_id  text,
  -- The archived label in R2 when R2 is configured; NULL renders on demand.
  label_url             text,
  label_key             text,
  carrier_cost_agorot   bigint CHECK (carrier_cost_agorot IS NULL OR carrier_cost_agorot >= 0),
  shopper_agorot        bigint NOT NULL DEFAULT 0 CHECK (shopper_agorot >= 0),
  weight_grams          integer NOT NULL CHECK (weight_grams > 0),
  pieces                integer NOT NULL DEFAULT 1 CHECK (pieces > 0),
  -- The lines this parcel covers, for the "which label was that" question.
  order_item_ids        uuid[] NOT NULL DEFAULT '{}',
  -- Newest first, [{at, status, description, location}], merged on every poll.
  events                jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_delivery    date,
  provider_response     jsonb,
  last_polled_at        timestamptz,
  last_event_at         timestamptz,
  delivered_at          timestamptz,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipments_order_id_idx ON public.shipments (order_id);

-- The poller's working set: everything not final, oldest poll first.
CREATE INDEX IF NOT EXISTS shipments_active_poll_idx
  ON public.shipments (last_polled_at NULLS FIRST)
  WHERE status NOT IN ('delivered', 'returned', 'cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS shipments_carrier_tracking_uq
  ON public.shipments (carrier_id, tracking_number);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS set_updated_at ON public.shipments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.shipments IS
  'One carrier label per parcel: tracking, label archive, courier cost (platform expense, agorot) and the event history the poller merges. docs/SHIPPING.md.';

-- ------------------------------------------------------------------------ RLS
--
-- The customer reads their own shipments through the order they own; nothing
-- else reads from the client. Every write is the service role (admin action,
-- cron poller), the same stance as order_items.

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipments_select_own" ON public.shipments;
CREATE POLICY "shipments_select_own"
  ON public.shipments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shipments.order_id AND o.user_id = auth.uid()
    )
  );

-- REVOKE ALL first: the default privileges hand authenticated REFERENCES and
-- TRIGGER along with the DML, and a REVOKE that lists only the DML leaves
-- those two behind (measured in the 2026-10-08 rehearsal).
REVOKE ALL ON public.shipments FROM anon;
REVOKE ALL ON public.shipments FROM authenticated;
GRANT SELECT ON public.shipments TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.shipments') IS NULL THEN
    RAISE EXCEPTION 'shipments was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shipping_carrier'
  ) THEN
    RAISE EXCEPTION 'orders.shipping_carrier was not added';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE tablename = 'shipments') <> 1 THEN
    RAISE EXCEPTION 'shipments should carry exactly one policy';
  END IF;
END $$;
