-- 193_price_history.sql
--
-- The record that makes a struck-through "before" price checkable.
--
-- WHY IT HAS TO EXIST
--
-- Israeli consumer law treats an advertised saving as a factual claim about
-- what the trader used to charge. `products.full_price` is a number an operator
-- types into a form; five components render it with a line through it and
-- nothing has ever checked it against anything.
--
-- Measured against production 2026-09-09:
--
--   44  active products
--   15  showing a struck-through full_price above the price charged
--   20  products with any price change recorded anywhere (audit_log)
--    0  products in BOTH sets
--
-- The intersection is empty. `audit_log` is not a substitute and the numbers
-- say why: 555 product rows, of which 21 mention `kenyon_price` at all, because
-- it records the edits that went through the audited path rather than the price
-- on every day. A 30-day window needs the price on every day, including the
-- days nobody edited anything.
--
-- APPEND-ONLY, AND THAT IS THE WHOLE POINT
--
-- This table exists to contradict a claim somebody wants to make. A history
-- that can be edited by whoever is under pressure to run a sale is not
-- evidence, it is a second copy of the claim. UPDATE and DELETE are refused by
-- trigger for every role including `service_role`, the same shape 177 gave
-- `wallet_entries`.
--
-- NO UNIQUE KEY ON (product, day), DELIBERATELY
--
-- A price can change twice in a day. Collapsing a day to one row would force
-- the writer to choose which of the two is "the" price for that day, and a
-- writer that chooses is a writer that can be wrong; forcing it to UPDATE the
-- earlier row would also break append-only. So a day may carry several rows and
-- the READER takes the lowest, which is the price a shopper could actually have
-- paid that day. The unique index below is over the full observation, so a
-- re-run of the snapshot is a no-op and a genuine change is a new row.
--
-- MONEY IS AGOROT, INTEGER, END TO END. `products` already carries generated
-- `*_agorot` twins of every numeric price column, so the snapshot reads
-- integers and no rounding happens anywhere on this path.

BEGIN;

CREATE TABLE IF NOT EXISTS public.price_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- The calendar day in Asia/Jerusalem, supplied by the writer. NOT
  -- `current_date`: the server runs in UTC and a snapshot at 02:00 Israeli time
  -- would be filed under the previous day, putting a hole in the window that
  -- nothing would report.
  observed_on      date NOT NULL,
  -- What a shopper would have paid that day, VAT included.
  price_agorot     bigint NOT NULL CHECK (price_agorot >= 0),
  -- The struck-through claim in force that day, if any. Recorded so a later
  -- audit can see WHEN a claim started, not only that it is here now.
  reference_agorot bigint CHECK (reference_agorot IS NULL OR reference_agorot >= 0),
  -- The product's status that day. A draft product is not on sale, and a window
  -- that counted draft days as observations would let a product be hidden for a
  -- month and come back with any "before" price at all.
  status           text NOT NULL,
  source           text NOT NULL DEFAULT 'snapshot'
                     CHECK (source IN ('snapshot', 'change', 'backfill')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- No `updated_at` and no `set_updated_at` trigger. The standard table shape does
-- not apply to an append-only table: a column that records when a row was last
-- changed is a column that promises rows can change.

COMMENT ON TABLE public.price_history IS
  'Append-only daily record of what each product cost. The evidence behind every struck-through price; see docs/PRICING-COMPLIANCE.md.';

-- The read the storefront and the admin both make: one product, recent days.
CREATE INDEX IF NOT EXISTS price_history_product_recent
  ON public.price_history (product_id, observed_on DESC);

-- Idempotence for the writer, over the whole observation rather than the day.
-- A re-run of the snapshot conflicts and does nothing; a real change on the
-- same day differs in `price_agorot` and lands as a new row.
CREATE UNIQUE INDEX IF NOT EXISTS price_history_observation_once
  ON public.price_history (
    product_id,
    observed_on,
    price_agorot,
    COALESCE(reference_agorot, -1),
    status
  );

-- ---------------------------------------------------------------- append-only

CREATE OR REPLACE FUNCTION public.fn_price_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'price_history is append-only: % refused. It is the evidence behind a price claim; a history that can be rewritten is not evidence.',
    TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS price_history_no_update ON public.price_history;
CREATE TRIGGER price_history_no_update
  BEFORE UPDATE ON public.price_history
  FOR EACH ROW EXECUTE FUNCTION public.fn_price_history_append_only();

DROP TRIGGER IF EXISTS price_history_no_delete ON public.price_history;
CREATE TRIGGER price_history_no_delete
  BEFORE DELETE ON public.price_history
  FOR EACH ROW EXECUTE FUNCTION public.fn_price_history_append_only();

-- The FK is ON DELETE CASCADE and the trigger refuses DELETE, so deleting a
-- product now fails rather than silently shredding its price history. That is
-- the intended order of precedence: products are soft-deleted here
-- (`deleted_at`), and a hard DELETE that would destroy the evidence behind
-- claims already made to shoppers should have to be argued for.

-- ------------------------------------------------------------------------ RLS

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- SELECT is public, and that is a decision rather than an oversight. What a
-- product used to cost is the evidence a shopper is entitled to when they are
-- shown a saving; there is nothing here that is not already on the page, one
-- day at a time. The storefront reads it through the anon client.
DROP POLICY IF EXISTS "price_history_select_public" ON public.price_history;
CREATE POLICY "price_history_select_public"
  ON public.price_history
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT, UPDATE or DELETE policy for any client role. The only writer is
-- the snapshot cron, which holds the service role and bypasses RLS. Revoking
-- the table grants as well as omitting the policies, because a permissive
-- SELECT policy added later must not be able to carry DML in with it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.price_history FROM anon, authenticated;
GRANT SELECT ON public.price_history TO anon, authenticated;

-- ------------------------------------------------------------------ first row
--
-- Seeds TODAY from the live catalogue, so the window starts the day this is
-- applied rather than the day somebody remembers to schedule the cron. The
-- source is 'backfill' and it is exactly one day: nothing here invents a price
-- for a day it was not observed, because a fabricated history is worse than
-- none -- it would let an unprovable claim pass the check that exists to catch
-- it.

INSERT INTO public.price_history (product_id, observed_on, price_agorot, reference_agorot, status, source)
SELECT
  p.id,
  (now() AT TIME ZONE 'Asia/Jerusalem')::date,
  p.kenyon_price_agorot,
  p.full_price_agorot,
  p.status::text,
  'backfill'
FROM public.products p
WHERE p.deleted_at IS NULL
  AND p.kenyon_price_agorot IS NOT NULL
ON CONFLICT DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.price_history;
  IF n = 0 THEN
    RAISE EXCEPTION 'price_history seeded no rows; the snapshot would start from nothing';
  END IF;
  RAISE NOTICE 'price_history: % observations', n;
END $$;

COMMIT;
