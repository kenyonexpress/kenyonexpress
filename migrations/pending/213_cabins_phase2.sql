-- 213_cabins_phase2.sql
--
-- Cabins: units, nightly rates, and a booking that cannot double-book.
--
-- =============================================================================
-- THE EXCLUSION CONSTRAINT IS THE WHOLE DESIGN
-- =============================================================================
--
-- Every other way of preventing a double booking is application code: read the
-- calendar, decide it is free, write the row. Two requests that read before
-- either writes both decide it is free, and both write. That race is not
-- theoretical for a cabin - it is what a popular weekend IS.
--
-- `EXCLUDE USING gist (unit_id WITH =, stay WITH &&)` makes it impossible in
-- the database. Two overlapping stays for one unit cannot both exist, whatever
-- the application believes, however many servers are running.
--
-- MEASURED, NOT ASSUMED. Probed against production inside a rolled-back block:
-- `btree_gist` is available (not installed) and installs cleanly, an
-- overlapping insert is refused with `exclusion_violation`, an ADJACENT one is
-- accepted, a cancelled booking blocks nothing, and another unit is unaffected.
--
-- ADJACENCY IS THE CASE WORTH NAMING. `daterange` is half-open: `[2026-10-01,
-- 2026-10-05)` is four nights ending on the morning of the 5th, and
-- `[2026-10-05, 2026-10-09)` starts that same morning. They do not overlap, and
-- they must not - otherwise checkout day is unbookable and a cabin loses a
-- night between every pair of guests.
--
-- =============================================================================
-- HOLIDAY DATES ARE A TABLE, NOT A CONSTANT
-- =============================================================================
--
-- [92] asks for weekday, weekend and Israeli holiday pricing. Weekday and
-- weekend are computable: the Israeli weekend is Friday and Saturday, and that
-- does not move.
--
-- Jewish holidays do. They follow a lunisolar calendar, they fall on different
-- Gregorian dates every year, and several have an eve that is priced like the
-- holiday and a day after that is not. Hard-coding a list here would be writing
-- dates this file cannot verify, which is the one thing `content/about.ts`
-- forbids in prose and is worse in a price.
--
-- So `cabin_holidays` is a table the operator fills, one row per date, and the
-- rate resolver treats any date in it as a holiday. An empty table means
-- holidays are priced as ordinary days - visibly wrong, and wrong in the
-- direction of charging less, rather than silently wrong on a date nobody
-- checked.

BEGIN;

ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'cabin';

COMMIT;

BEGIN;

-- Needed for `unit_id WITH =` to sit beside a range in one EXCLUDE constraint:
-- gist has no default operator class for uuid equality without it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =============================================================================
-- 1. cabin_products  (the CTI subtype)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cabin_products (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,

  check_in_hour  smallint NOT NULL DEFAULT 15 CHECK (check_in_hour BETWEEN 0 AND 23),
  check_out_hour smallint NOT NULL DEFAULT 11 CHECK (check_out_hour BETWEEN 0 AND 23),

  max_guests smallint NOT NULL DEFAULT 2 CHECK (max_guests BETWEEN 1 AND 40),
  min_nights smallint NOT NULL DEFAULT 1 CHECK (min_nights BETWEEN 1 AND 60),

  -- How many days before check-in a guest may cancel free of charge.
  --
  -- 14 BY DEFAULT, AND THAT IS THE LAW RATHER THAN A POLICY. The Israeli
  -- Consumer Protection Law's distance-selling rules give 14 days from the
  -- transaction, and for accommodation the cancellation must reach the supplier
  -- at least 7 days (not counting rest days) before the service date. The
  -- default here is the generous reading; a supplier may widen it and the CHECK
  -- stops them narrowing it below the statutory floor.
  free_cancellation_days smallint NOT NULL DEFAULT 14
    CHECK (free_cancellation_days BETWEEN 7 AND 365),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Check-out before check-in on the same day would make a one-night stay
  -- impossible to express. Equal is fine; 15:00 to 15:00 is a full day.
  CONSTRAINT cabin_products_hours_sane CHECK (check_in_hour <> check_out_hour)
);

DROP TRIGGER IF EXISTS cabin_products_set_updated_at ON public.cabin_products;
CREATE TRIGGER cabin_products_set_updated_at
  BEFORE UPDATE ON public.cabin_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 2. cabin_units
-- =============================================================================
--
-- A product may be one cabin or six identical ones. The unit is what gets
-- booked, because two guests can hold the same weekend in a six-unit property
-- and the exclusion constraint has to be per unit rather than per product.

CREATE TABLE IF NOT EXISTS public.cabin_units (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.cabin_products(product_id) ON DELETE CASCADE,
  name_he    text NOT NULL CHECK (length(btrim(name_he)) BETWEEN 1 AND 120),

  -- The fallback price for a night with no matching rate row. NOT NULL: a unit
  -- with no price is a unit that can be booked for nothing.
  base_price_agorot integer NOT NULL CHECK (base_price_agorot > 0),

  position   integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (product_id, position)
);

DROP TRIGGER IF EXISTS cabin_units_set_updated_at ON public.cabin_units;
CREATE TRIGGER cabin_units_set_updated_at
  BEFORE UPDATE ON public.cabin_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 3. cabin_rates and cabin_holidays
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cabin_rates (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.cabin_units(id) ON DELETE CASCADE,

  -- `weekend` and `holiday` are computed per night by the resolver.
  -- `range` is a season or an event and carries its own dates.
  kind text NOT NULL CHECK (kind IN ('weekend', 'holiday', 'range')),

  price_agorot integer NOT NULL CHECK (price_agorot > 0),

  -- Only for `range`. Half-open, like `cabin_bookings.stay`, so two adjacent
  -- seasons do not fight over the day between them.
  applies_on daterange,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cabin_rates_range_has_dates
    CHECK ((kind = 'range') = (applies_on IS NOT NULL)),

  -- One weekend price and one holiday price per unit. Two would make the
  -- nightly price depend on which row the planner returned first.
  UNIQUE NULLS NOT DISTINCT (unit_id, kind, applies_on)
);

DROP TRIGGER IF EXISTS cabin_rates_set_updated_at ON public.cabin_rates;
CREATE TRIGGER cabin_rates_set_updated_at
  BEFORE UPDATE ON public.cabin_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/**
 * The dates that count as holidays. Filled by the operator; see the header on
 * why this is not a constant.
 *
 * Not per unit and not per supplier: a holiday is a property of the calendar,
 * and a per-unit list would drift into six answers to "is the 2nd of October a
 * holiday".
 */
CREATE TABLE IF NOT EXISTS public.cabin_holidays (
  on_date date PRIMARY KEY,
  name_he text NOT NULL CHECK (length(btrim(name_he)) BETWEEN 2 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. cabin_bookings, and the constraint that makes double-booking impossible
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cabin_bookings (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.cabin_units(id) ON DELETE CASCADE,

  -- Half-open: `[in, out)`. The night of check-out is not booked, which is what
  -- lets the next guest arrive that morning.
  stay daterange NOT NULL,

  -- `held`      a checkout in progress. Blocks the dates for 15 minutes.
  -- `confirmed` paid.
  -- `cancelled` blocks nothing, which is why the constraint excludes it.
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'confirmed', 'cancelled')),

  user_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,

  guests   smallint NOT NULL DEFAULT 1 CHECK (guests BETWEEN 1 AND 40),
  total_agorot integer NOT NULL CHECK (total_agorot >= 0),

  -- When a `held` booking stops blocking. [92] says 15 minutes.
  held_until timestamptz,
  cancelled_at timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A stay must be at least one night. `daterange` permits an empty range and
  -- an empty range overlaps nothing, so without this a zero-night booking would
  -- slip past the exclusion constraint entirely.
  CONSTRAINT cabin_bookings_stay_not_empty CHECK (NOT isempty(stay)),

  -- A hold that never expires is a permanent block created by an abandoned
  -- checkout.
  CONSTRAINT cabin_bookings_held_has_expiry
    CHECK (status <> 'held' OR held_until IS NOT NULL),

  CONSTRAINT cabin_bookings_cancelled_has_date
    CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),

  -- THE ONE THAT MATTERS. Two overlapping stays for one unit cannot both exist,
  -- whatever the application believes and however many servers are running.
  -- Cancelled rows are excluded so a cancellation frees the dates immediately.
  CONSTRAINT cabin_bookings_no_overlap
    EXCLUDE USING gist (unit_id WITH =, stay WITH &&) WHERE (status <> 'cancelled')
);

DROP TRIGGER IF EXISTS cabin_bookings_set_updated_at ON public.cabin_bookings;
CREATE TRIGGER cabin_bookings_set_updated_at
  BEFORE UPDATE ON public.cabin_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS cabin_bookings_unit_idx ON public.cabin_bookings (unit_id, status);
CREATE INDEX IF NOT EXISTS cabin_bookings_user_idx ON public.cabin_bookings (user_id)
  WHERE user_id IS NOT NULL;
-- The sweep's own query: expired holds, oldest first.
CREATE INDEX IF NOT EXISTS cabin_bookings_expiring_holds_idx
  ON public.cabin_bookings (held_until) WHERE status = 'held';

-- =============================================================================
-- 5. release_expired_cabin_holds
-- =============================================================================

/**
 * Cancels holds whose fifteen minutes are up.
 *
 * A FUNCTION AND NOT A VIEW FILTER. The exclusion constraint has no notion of
 * time: a `held` row blocks its dates until something changes its status, so an
 * abandoned checkout would block a weekend forever. Filtering expired holds out
 * of the availability READ would show the dates as free and then fail the
 * insert against the constraint, which is a booking that looks available and
 * cannot be made.
 *
 * `cancelled` rather than deleted, so an operator asking "why did this weekend
 * show as taken at 14:05" has a row to look at.
 */
CREATE OR REPLACE FUNCTION public.release_expired_cabin_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.cabin_bookings
     SET status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = coalesce(cancel_reason, 'hold expired')
   WHERE status = 'held'
     AND held_until IS NOT NULL
     AND held_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_cabin_holds() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 6. RLS
-- =============================================================================

ALTER TABLE public.cabin_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabin_units    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabin_rates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabin_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabin_bookings ENABLE ROW LEVEL SECURITY;

-- The property, its units, its prices and the holiday calendar are all a sales
-- page. A guest picking dates has to see what a night costs before they book.
DROP POLICY IF EXISTS cabin_products_public_read ON public.cabin_products;
CREATE POLICY cabin_products_public_read ON public.cabin_products
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS cabin_units_public_read ON public.cabin_units;
CREATE POLICY cabin_units_public_read ON public.cabin_units
  FOR SELECT TO anon, authenticated USING (is_active);
DROP POLICY IF EXISTS cabin_rates_public_read ON public.cabin_rates;
CREATE POLICY cabin_rates_public_read ON public.cabin_rates
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS cabin_holidays_public_read ON public.cabin_holidays;
CREATE POLICY cabin_holidays_public_read ON public.cabin_holidays
  FOR SELECT TO anon, authenticated USING (true);

-- BOOKINGS ARE THE LINE, AND THE ANSWER IS NOT "PRIVATE".
--
-- A guest must see that a weekend is taken, or the calendar is useless. But
-- WHO took it, for how much, and with how many guests is nobody else's
-- business. So the row is not readable by the public at all, and availability
-- is served by the view below, which exposes only unit and dates.
DROP POLICY IF EXISTS cabin_bookings_own ON public.cabin_bookings;
CREATE POLICY cabin_bookings_own ON public.cabin_bookings
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

/**
 * What a calendar needs and nothing more: which unit, which nights, and that
 * something is there.
 *
 * `security_invoker = false` deliberately - this view is the one thing that
 * shows a stranger that dates are taken, and it can only do that by seeing rows
 * the querying role cannot. What it exposes is three columns with no person, no
 * price and no guest count in them.
 */
CREATE OR REPLACE VIEW public.v_cabin_availability
WITH (security_invoker = false) AS
  SELECT unit_id, stay, status
    FROM public.cabin_bookings
   WHERE status <> 'cancelled'
     AND (status <> 'held' OR (held_until IS NOT NULL AND held_until > now()));

GRANT SELECT ON public.v_cabin_availability TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cabin_products FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cabin_units FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cabin_rates FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cabin_holidays FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cabin_bookings FROM anon, authenticated;
REVOKE ALL ON public.cabin_bookings FROM anon;

-- =============================================================================
-- 7. The phase switch, off
-- =============================================================================

INSERT INTO public.phase_config (product_type, phase, is_enabled, enabled_at, note)
VALUES ('cabin', 2, false, NULL, 'שלב 2, כבוי לפי [92]. אין צימרים.')
ON CONFLICT (product_type) DO UPDATE
  SET is_enabled = false, note = excluded.note;

COMMIT;
