-- 197_shipping_zones_and_pickup.sql
--
-- Somewhere to put a delivery rate, and somewhere to put a collection point.
--
-- WHAT IS TRUE TODAY, MEASURED 2026-09-09
--
-- Nothing charges for delivery anywhere. `orders` has no shipping column, the
-- cart view has no shipping line, `calculateSettlement` takes no shipping
-- input, and all 44 active products carry `requires_shipping = true`. Delivery
-- is free for everyone.
--
-- That is a decision, not a gap: `TopBar` prints "משלוח מהיר חינם" on every
-- page of the site with no qualifier, and the product page promises 3-7 business
-- days with no fee beside it. The code and the banner agree.
--
-- WHY A TABLE FOR A POLICY THAT SAYS ZERO
--
-- Because "free" is currently expressed as an ABSENCE, and an absence cannot be
-- changed carefully. There is nowhere to write "Eilat costs more", nowhere to
-- write "free over ₪199", and no way to tell whether free-everywhere was chosen
-- or merely never built. This makes the policy a value. Seeded with exactly what
-- the site already does, so applying it changes nothing a customer sees.
--
-- NOT WIRED INTO CHECKOUT, AND NOT BY OVERSIGHT
--
-- Charging for delivery needs rates nobody has set and contradicts a sentence
-- printed on every page; changing that sentence is a business decision.
-- `src/lib/shipping/zones.ts` is the reader, `zones.test.ts` holds the table and
-- the banner together -- a surcharge configured while the banner still says free
-- fails the suite -- and no code path adds a shipping line to an order. The
-- money path is untouched by this file.
--
-- MONEY IS AGOROT, INTEGER, with a non-negative CHECK. A delivery charge has no
-- sign.

BEGIN;

-- ------------------------------------------------------------------- zones

CREATE TABLE IF NOT EXISTS public.shipping_zones (
  -- The zone key, matching ZoneId in src/lib/shipping/zones.ts. Text and not an
  -- enum: adding a zone should not need an ALTER TYPE that cannot be run in the
  -- same transaction as the row that uses it (the trap 135 was split over).
  id                 text PRIMARY KEY,
  name_he            text NOT NULL,
  flat_agorot        bigint NOT NULL DEFAULT 0 CHECK (flat_agorot >= 0),
  -- NULL means "never free". 0 means "free from the first agora", which is what
  -- every row is seeded with.
  free_above_agorot  bigint CHECK (free_above_agorot IS NULL OR free_above_agorot >= 0),
  deliverable        boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS set_updated_at ON public.shipping_zones;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.shipping_zones IS
  'Delivery rate by destination. Seeded free everywhere to match the sitewide banner; see docs/SHIPPING.md.';

-- The seed IS the current policy, written out per zone rather than as one
-- default, so changing one of them is a diff somebody has to look at.
--
-- `eilat` is separate from `south` and that split is the only one here that is
-- not arbitrary: it is a four-hour drive past the last distribution point, every
-- Israeli courier prices it apart, and it is exactly where a flat national rate
-- quietly loses money.
INSERT INTO public.shipping_zones (id, name_he, flat_agorot, free_above_agorot, deliverable, sort_order)
VALUES
  ('center', 'מרכז',        0, 0, true, 1),
  ('north',  'צפון',        0, 0, true, 2),
  ('south',  'דרום',        0, 0, true, 3),
  ('eilat',  'אילת והערבה', 0, 0, true, 4),
  ('remote', 'אזור מרוחק',  0, 0, true, 5)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------- pickup points

CREATE TABLE IF NOT EXISTS public.pickup_points (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id       text REFERENCES public.shipping_zones(id),
  name_he       text NOT NULL,
  address_he    text NOT NULL,
  city_he       text NOT NULL,
  opening_hours text,
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.pickup_points;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pickup_points
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS pickup_points_active_by_city
  ON public.pickup_points (city_he) WHERE is_active;

COMMENT ON TABLE public.pickup_points IS
  'Places a customer can collect from. DELIBERATELY EMPTY: no arrangement exists with any location yet, and a seeded fake would send a customer to a door that is not expecting them.';

-- NO SEED, and the comment above says why. A pickup point is a physical
-- arrangement with a real shop, not a row. Inventing one for demonstration is
-- the single worst thing this file could do, because the failure lands on a
-- customer standing outside a locked door holding an order number.

-- ------------------------------------------------------------------------ RLS
--
-- Both tables are PUBLIC to read. A delivery rate and a collection address are
-- what a shopper needs before they buy; hiding them would mean the checkout has
-- to proxy every read for no benefit. Writes are admin-only through the panel,
-- which holds the service role.

ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipping_zones_select_public" ON public.shipping_zones;
CREATE POLICY "shipping_zones_select_public"
  ON public.shipping_zones FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.shipping_zones FROM anon, authenticated;
GRANT SELECT ON public.shipping_zones TO anon, authenticated;

ALTER TABLE public.pickup_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pickup_points_select_active" ON public.pickup_points;
CREATE POLICY "pickup_points_select_active"
  ON public.pickup_points FOR SELECT TO anon, authenticated USING (is_active);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pickup_points FROM anon, authenticated;
GRANT SELECT ON public.pickup_points TO anon, authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.shipping_zones;
  IF n <> 5 THEN RAISE EXCEPTION 'expected 5 shipping zones, found %', n; END IF;
  SELECT count(*) INTO n FROM public.shipping_zones WHERE flat_agorot <> 0;
  IF n <> 0 THEN
    RAISE EXCEPTION 'a zone is seeded with a charge; the site still advertises free delivery';
  END IF;
END $$;

COMMIT;
