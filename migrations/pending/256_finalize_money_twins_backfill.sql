-- 256_finalize_money_twins_backfill.sql
--
-- The two column names the payment finalize path reads after the card has
-- been charged, guaranteed present and populated on BOTH schema lineages
-- (STEP 40, 08.10). Companion to 224, which added them to the hosted pre-059
-- lineage as GENERATED twins; this file is the idempotent "add if missing,
-- backfill defaults" that the launch checklist asked for, and it is a
-- measured no-op on production today.
--
-- WHAT finalize.ts NAMES.
--   orders.cashback_applied_agorot      (select, finalize.ts via orderCashbackSelect)
--   order_items.unit_price_agorot       (select, finalize.ts via orderItemPriceSelect)
-- A 42703 on either aborts the WHOLE select for an order whose card was
-- already charged (docs/FAILURE-MODES.md 2.2). 224 closed that on the hosted
-- project; this file closes it on any database the code might meet.
--
-- MEASURED ON PRODUCTION 2026-10-08 (information_schema, management API):
--   orders.cashback_applied_agorot   bigint, GENERATED ALWAYS AS
--     (round((cashback_applied_ils * 100::numeric)))::bigint STORED
--   order_items.unit_price_agorot    bigint, GENERATED ALWAYS AS
--     (round((unit_price_ils * 100::numeric)))::bigint STORED
--   46 orders, 46 order_items: 0 NULLs, 0 mismatches against the ils sources.
--   So on production every branch below is skipped and the closing DO block
--   only verifies. Rehearsed inside BEGIN/ROLLBACK the same day: no error.
--
-- THREE CASES PER COLUMN, EACH GUARDED ON information_schema.
--   (a) absent, and the ils source exists (hosted pre-059 lineage before
--       224): add the GENERATED twin exactly as 224 does. Generated columns
--       are populated for every existing row by the ALTER itself, so the
--       backfill is implicit and the twin can never be NULL while its source
--       is NOT NULL (both sources are).
--   (b) absent, and no ils source (post-059 lineage that somehow lacks the
--       writable column): add `bigint NOT NULL DEFAULT 0`. DEFAULT on ADD
--       COLUMN rewrites nothing on PG11+ and populates every existing row.
--   (c) present and NOT generated (post-059 writable column): set DEFAULT 0
--       if it has none and backfill NULLs to 0. The code treats a missing
--       cashback as zero (readOrderCashbackAgorot) and a NULL unit price as
--       zero (queries/orders.ts), so 0 is the value the readers already
--       assume; the column is left nullable so no lock beyond the UPDATE.
--   (d) present and GENERATED (production today): nothing; a generated
--       column accepts neither a DEFAULT nor an UPDATE (428C9).
--
-- MONEY. Integer agorot only (bigint); the only arithmetic is 224's
-- round(ils * 100), never a float division.
--
-- ROLLBACK (only what this file itself created; 224's twins stay 224's):
--   alter table public.orders drop column if exists cashback_applied_agorot;
--   alter table public.order_items drop column if exists unit_price_agorot;
--   The DEFAULT 0 set in case (c) is harmless to leave; to undo it:
--   alter table public.orders alter column cashback_applied_agorot drop default;
--   alter table public.order_items alter column unit_price_agorot drop default;
--   The backfilled zeros cannot be told apart from real zeros and are not
--   reverted; they replaced NULLs the readers already read as 0.

BEGIN;

-- ---------------------------------------------------------------------------
-- orders.cashback_applied_agorot
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_exists boolean;
  v_generated text;
  v_default text;
  v_has_source boolean;
BEGIN
  SELECT true, is_generated, column_default
    INTO v_exists, v_generated, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orders'
     AND column_name = 'cashback_applied_agorot';
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name = 'cashback_applied_ils'
  ) INTO v_has_source;

  IF v_exists IS NULL THEN
    IF v_has_source THEN
      -- (a) hosted lineage before 224: the generated twin, as 224 writes it
      ALTER TABLE public.orders
        ADD COLUMN cashback_applied_agorot bigint
          GENERATED ALWAYS AS ((round((cashback_applied_ils * (100)::numeric)))::bigint) STORED;
      COMMENT ON COLUMN public.orders.cashback_applied_agorot IS
        '224/256: generated twin of cashback_applied_ils, integer agorot under the post-059 name. Read-only; write cashback_applied_ils.';
    ELSE
      -- (b) no source to derive from: a writable integer-agorot column, zero-filled
      ALTER TABLE public.orders
        ADD COLUMN cashback_applied_agorot bigint NOT NULL DEFAULT 0;
      COMMENT ON COLUMN public.orders.cashback_applied_agorot IS
        '256: wallet/cashback credit applied to the order, integer agorot. Added with DEFAULT 0 because finalize reads it after the card is charged.';
    END IF;
  ELSIF v_generated <> 'ALWAYS' THEN
    -- (c) writable post-059 column: default + backfill, no type change
    IF v_default IS NULL THEN
      ALTER TABLE public.orders ALTER COLUMN cashback_applied_agorot SET DEFAULT 0;
    END IF;
    UPDATE public.orders SET cashback_applied_agorot = 0 WHERE cashback_applied_agorot IS NULL;
  END IF;
  -- (d) generated: nothing to add, nothing to backfill
END $$;

-- ---------------------------------------------------------------------------
-- order_items.unit_price_agorot
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_exists boolean;
  v_generated text;
  v_default text;
  v_has_source boolean;
BEGIN
  SELECT true, is_generated, column_default
    INTO v_exists, v_generated, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'order_items'
     AND column_name = 'unit_price_agorot';
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'order_items'
       AND column_name = 'unit_price_ils'
  ) INTO v_has_source;

  IF v_exists IS NULL THEN
    IF v_has_source THEN
      ALTER TABLE public.order_items
        ADD COLUMN unit_price_agorot bigint
          GENERATED ALWAYS AS ((round((unit_price_ils * (100)::numeric)))::bigint) STORED;
      COMMENT ON COLUMN public.order_items.unit_price_agorot IS
        '224/256: generated twin of unit_price_ils, integer agorot under the post-059 name. Read-only; write unit_price_ils.';
    ELSE
      ALTER TABLE public.order_items
        ADD COLUMN unit_price_agorot bigint NOT NULL DEFAULT 0;
      COMMENT ON COLUMN public.order_items.unit_price_agorot IS
        '256: sticker price of one unit, integer agorot. Added with DEFAULT 0 because finalize reads it after the card is charged.';
    END IF;
  ELSIF v_generated <> 'ALWAYS' THEN
    IF v_default IS NULL THEN
      ALTER TABLE public.order_items ALTER COLUMN unit_price_agorot SET DEFAULT 0;
    END IF;
    UPDATE public.order_items SET unit_price_agorot = 0 WHERE unit_price_agorot IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Verify: both names answer, nothing is NULL, and a generated twin agrees
-- with its source on every row. Raising here rolls the whole file back.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_nulls bigint;
  v_mismatch bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name = 'cashback_applied_agorot'
  ) THEN
    RAISE EXCEPTION '256: orders.cashback_applied_agorot is still missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'order_items'
       AND column_name = 'unit_price_agorot'
  ) THEN
    RAISE EXCEPTION '256: order_items.unit_price_agorot is still missing';
  END IF;

  SELECT count(*) INTO v_nulls FROM public.orders WHERE cashback_applied_agorot IS NULL;
  IF v_nulls > 0 THEN
    RAISE EXCEPTION '256: % orders still have NULL cashback_applied_agorot', v_nulls;
  END IF;
  SELECT count(*) INTO v_nulls FROM public.order_items WHERE unit_price_agorot IS NULL;
  IF v_nulls > 0 THEN
    RAISE EXCEPTION '256: % order_items still have NULL unit_price_agorot', v_nulls;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders'
       AND column_name = 'cashback_applied_ils'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.orders WHERE cashback_applied_agorot <> round(cashback_applied_ils * 100)::bigint'
       INTO v_mismatch;
    IF v_mismatch > 0 THEN
      RAISE EXCEPTION '256: % orders disagree between cashback_applied_agorot and cashback_applied_ils', v_mismatch;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'order_items'
       AND column_name = 'unit_price_ils'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.order_items WHERE unit_price_agorot <> round(unit_price_ils * 100)::bigint'
       INTO v_mismatch;
    IF v_mismatch > 0 THEN
      RAISE EXCEPTION '256: % order_items disagree between unit_price_agorot and unit_price_ils', v_mismatch;
    END IF;
  END IF;
END $$;

COMMIT;

-- NOT APPLIED. Written 2026-10-08 (STEP 40). Rehearsed on production inside
-- BEGIN/ROLLBACK through the management API the same day, three times:
--   (d) as-is: every branch skipped (both columns are 224's generated twins),
--       the verify block passed on 46 orders and 46 order_items;
--   (a) with both twins dropped first inside the transaction: re-added as
--       GENERATED ALWAYS, 0 NULLs on every row;
--   (c) with the twins replaced by plain nullable bigint columns and the ils
--       sources dropped: DEFAULT 0 set, every NULL backfilled to 0.
-- After each ROLLBACK is_generated, column_default and the 224 comments were
-- unchanged. Applying it to production as it stands is a no-op and still
-- waits for explicit approval like every file in this directory.
