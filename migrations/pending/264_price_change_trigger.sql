-- 264_price_change_trigger.sql
--
-- Every price change on `products` leaves a `price_history` row, from inside
-- the database (STEP 59).
--
-- WHAT 193 LEFT OPEN
--
-- `price_history` is observed once a day by two crons (03:00 and 04:45) and on
-- every applied flash deal (201, `source = 'change'`). Since STEP 59 the
-- product editor and the bulk price tool write the same row from the server.
-- That still leaves every path that changes `kenyon_price` or `full_price`
-- without going through those three: the CSV import, a SQL fix in the
-- dashboard, a future tool nobody has written. A price lowered at 10:00 and
-- raised at 18:00 by any of those leaves no row, and the next morning the
-- storefront's "price dropped" badge, the chart, and the thirty-day reference
-- check (docs/PRICING-COMPLIANCE.md) all reason over a day that never
-- happened.
--
-- A trigger on the table the price lives in closes every path at once.
--
-- WHY SECURITY DEFINER
--
-- 193 grants INSERT on `price_history` to nobody but the owner: the admin's
-- session (`authenticated`) cannot write evidence, by design. A trigger
-- function runs as the role that performed the UPDATE unless it is DEFINER,
-- so an admin editing a product through RLS would have the trigger fail on
-- 42501 and the edit roll back with it. DEFINER, owned by postgres,
-- `search_path = ''`, every reference schema-qualified, and the function is
-- reachable only as a trigger (EXECUTE revoked from PUBLIC), the shape 159
-- pinned for every definer function here.
--
-- WHAT IT DOES NOT DO
--
--   * It does not fire on INSERT: a new product is observed by the editor's
--     own write and by the next snapshot. Firing on INSERT would also record
--     every CSV import row as a "change".
--   * It does not record a draft as if it were on sale: the row carries the
--     product's status and every reader filters on it (193's rule).
--   * It does not UPDATE anything in `price_history`; the append-only trigger
--     there would refuse it, and nothing here asks.
--   * It never fails the UPDATE that fired it. ON CONFLICT DO NOTHING absorbs
--     the unique index (the editor's own row, a rerun), and any other error is
--     caught and raised as a WARNING: a product edit must not roll back over
--     the record of itself.
--
-- MONEY IS INTEGER AGOROT: the generated `*_agorot` twins are read, never the
-- numeric columns, so no rounding happens here.
--
-- PRECONDITIONS: 193 applied (`public.price_history` exists, with
-- `price_history_observation_once`). 140/147 applied (the generated twins
-- `kenyon_price_agorot`, `full_price_agorot` exist; measured live 2026-09-10).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS products_price_change_history ON public.products;
--   DROP FUNCTION IF EXISTS public.fn_products_price_change_history();
-- The rows already written stay: they are observations and 193 refuses to
-- delete them, which is correct.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_products_price_change_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only a real move of either price, only on a live row with a price.
  IF NEW.deleted_at IS NOT NULL OR NEW.kenyon_price_agorot IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.kenyon_price_agorot IS NOT DISTINCT FROM OLD.kenyon_price_agorot
     AND NEW.full_price_agorot IS NOT DISTINCT FROM OLD.full_price_agorot THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.price_history
      (product_id, observed_on, price_agorot, reference_agorot, status, source)
    VALUES (
      NEW.id,
      (now() AT TIME ZONE 'Asia/Jerusalem')::date,
      NEW.kenyon_price_agorot,
      NEW.full_price_agorot,
      NEW.status::text,
      'change'
    )
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'price_history change row skipped for product %: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_products_price_change_history() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_products_price_change_history() IS
  'AFTER UPDATE OF kenyon_price, full_price ON products: appends the new price to price_history (193) as source=change. DEFINER because 193 grants INSERT to no client role.';

DROP TRIGGER IF EXISTS products_price_change_history ON public.products;
CREATE TRIGGER products_price_change_history
  AFTER UPDATE OF kenyon_price, full_price ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_products_price_change_history();

-- ------------------------------------------------------------------ self-check
--
-- Proves the trigger writes one row for a price move and none for a no-op,
-- without leaving either behind: the product is moved and moved back inside
-- a savepoint that is rolled back. 193's append-only rule is not touched,
-- because a rolled-back INSERT is not an UPDATE or a DELETE.

DO $$
DECLARE
  pid uuid;
  before_n int;
  after_n int;
BEGIN
  SELECT id INTO pid
  FROM public.products
  WHERE deleted_at IS NULL AND kenyon_price_agorot IS NOT NULL
  ORDER BY created_at
  LIMIT 1;
  IF pid IS NULL THEN
    RAISE NOTICE 'price_change_trigger: no priced product to rehearse on; trigger installed untested';
    RETURN;
  END IF;

  SELECT count(*) INTO before_n FROM public.price_history WHERE product_id = pid;

  -- A move of one agora: the twin is generated from the numeric column.
  UPDATE public.products SET kenyon_price = kenyon_price + 0.01 WHERE id = pid;
  SELECT count(*) INTO after_n FROM public.price_history WHERE product_id = pid;
  IF after_n <> before_n + 1 THEN
    RAISE EXCEPTION 'price_change_trigger: expected one new row after a price move, got % -> %', before_n, after_n;
  END IF;

  -- The same price again: no row.
  UPDATE public.products SET kenyon_price = kenyon_price WHERE id = pid;
  SELECT count(*) INTO after_n FROM public.price_history WHERE product_id = pid;
  IF after_n <> before_n + 1 THEN
    RAISE EXCEPTION 'price_change_trigger: a no-op UPDATE wrote a row (% -> %)', before_n + 1, after_n;
  END IF;

  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'price_change_trigger:selfcheck:ok';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'price_change_trigger:selfcheck:ok' THEN
      -- The exception rolled the rehearsal back; the trigger itself stays.
      RAISE NOTICE 'price_change_trigger: self-check passed and rolled back';
    ELSE
      RAISE;
    END IF;
END $$;

COMMIT;
