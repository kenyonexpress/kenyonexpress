-- 201_scheduled_price_changes.sql
--
-- A flash deal: a price change with a time on it.
--
-- WHAT EXISTS AND WHAT DOES NOT
--
-- `discount_campaigns` (096) schedules a CODE: `starts_at`, `expires_at`,
-- `max_uses`, `max_uses_per_user`, `allow_stacking`, and — since 194 — caps
-- that are actually counted. That is a promo engine and it is a good one.
--
-- What has never existed is a scheduled change to a PRICE. A flash deal is not
-- a code somebody types; it is the product costing less between two o'clock and
-- six, on the page, for everybody. Today the only way to run one is an operator
-- editing `kenyon_price` twice and remembering to come back.
--
-- THE INTERESTING PART IS WHAT THIS DOES **NOT** NEED TO DO
--
-- A scheduler that moves prices on a timer, over a catalogue where 15 of 44
-- products already advertise a struck-through price nobody can evidence
-- (`docs/PRICING-COMPLIANCE.md`), reads like a machine for manufacturing
-- non-compliant discounts. It is not, and the reason is that 193 already
-- governs the claim rather than the price.
--
-- Israeli law constrains the "before" price, not the price. Lowering is always
-- lawful. What a flash deal changes is the EVIDENCE: after a day at ₪99, a
-- `full_price` of ₪150 stops being defensible for thirty days — and
-- `checkReferencePrice` works that out on its own from `price_history`, and the
-- storefront stops painting the strike-through with nobody deciding anything.
--
-- So this file's duty to compliance is one line of it: **every applied change
-- writes a `price_history` row with `source = 'change'`.** That is the column
-- 193 created for exactly this and left unused, and it closes the sampling gap
-- 193 documented — until now the record was one observation a day at 04:00, so
-- a flash deal that opened at 10:00 and closed at 18:00 left no trace at all.
--
-- WHY A TABLE AND NOT `pg_cron`
--
-- `pg_cron` is installed (161) and could hold a per-deal job. A row can be
-- read, listed, cancelled, and shown to an operator who wants to know what is
-- about to happen to their catalogue; a scheduled job in another schema can be
-- none of those without a query nobody will write. The applying cron already
-- exists as a route with authentication and logging around it.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.scheduled_price_changes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- When it takes effect. A row whose time has passed and which has not been
  -- applied is still due: a cron that missed a run must catch up rather than
  -- skip, because a flash deal nobody ran is a promise on a marketing email
  -- that the site did not keep.
  effective_at       timestamptz NOT NULL,
  -- Integer agorot, like every other money column here. NOT a percentage: a
  -- flash deal is "this costs ₪99 today", and a percentage of a price that has
  -- itself moved since the deal was scheduled produces a number nobody chose.
  price_agorot       bigint NOT NULL CHECK (price_agorot >= 0),
  -- The struck-through claim to set alongside it, or NULL to leave whatever is
  -- there alone. Settable because ENDING a flash deal usually means restoring
  -- both numbers, and a scheduler that could only move one of them would leave
  -- the pair inconsistent for however long it took somebody to notice.
  reference_agorot   bigint CHECK (reference_agorot IS NULL OR reference_agorot >= 0),
  note               text CHECK (note IS NULL OR char_length(note) <= 200),
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  applied_at         timestamptz,
  -- Cancelled rather than deleted: "we were going to run this and pulled it" is
  -- a fact worth keeping next to the deal that did run, and a deleted row
  -- cannot be told from one that never existed.
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  last_error         text
);

COMMENT ON TABLE public.scheduled_price_changes IS
  'Flash deals: a price change with a time on it. Applied by /api/cron/price-schedule, which also writes the price_history row. See docs/PROMOS.md.';

-- The cron's only query: due, not yet applied, not cancelled.
CREATE INDEX IF NOT EXISTS scheduled_price_changes_due
  ON public.scheduled_price_changes (effective_at)
  WHERE applied_at IS NULL AND cancelled_at IS NULL;

-- The admin's: everything for one product, newest first.
CREATE INDEX IF NOT EXISTS scheduled_price_changes_by_product
  ON public.scheduled_price_changes (product_id, effective_at DESC);

-- One PENDING change per product per moment. Two rows at the same instant are
-- two different prices with no rule for which wins, and the answer would depend
-- on row order — a coin toss over what a customer is charged.
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_price_changes_one_per_moment
  ON public.scheduled_price_changes (product_id, effective_at)
  WHERE applied_at IS NULL AND cancelled_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.scheduled_price_changes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.scheduled_price_changes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------- RLS
--
-- Nothing here is public. A schedule of future prices is the single most
-- valuable thing a competitor could read off this database, and it would also
-- let a shopper wait for a drop they can see coming. Admin-only through the
-- panel, which holds the service role.
--
-- RESTRICTIVE rather than "no policies", the shape 172 installed: a permissive
-- policy added later cannot outvote it, whereas an empty policy list stops
-- protecting the table the moment somebody adds one.

ALTER TABLE public.scheduled_price_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_price_changes_deny_all_client_roles"
  ON public.scheduled_price_changes;
CREATE POLICY "scheduled_price_changes_deny_all_client_roles"
  ON public.scheduled_price_changes
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.scheduled_price_changes FROM anon, authenticated;

COMMIT;
