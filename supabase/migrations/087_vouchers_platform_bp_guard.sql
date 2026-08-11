-- 087_vouchers_platform_bp_guard.sql
--
-- LOCAL ONLY. NOT APPLIED TO PRODUCTION.
--
-- 073 declared the voucher's split snapshot with two deliberate guarantees, and
-- both were lost when 059's converter renamed the column:
--
--     platform_percent numeric(5,2) NOT NULL          <- no default, on purpose
--     CONSTRAINT vouchers_platform_percent_range
--       CHECK (platform_percent >= 0 AND platform_percent <= 100)
--
-- The comment on the column states the intent in full: "No default: a voucher
-- whose split was never set is a bug, not a 100 percent platform take."
--
-- After the rename the live schema reads:
--
--     platform_bp             integer NULL            <- nullable
--     platform_percent_legacy numeric NULL
--     CONSTRAINT vouchers_platform_percent_range
--       CHECK (platform_percent_legacy >= 0 AND platform_percent_legacy <= 100)
--
-- The CHECK followed the old column into retirement and now guards a column
-- nothing writes, where it is vacuously true forever. The NOT NULL did not
-- survive at all. So the one thing 073 went out of its way to make impossible -
-- a voucher issued with no recorded split - became not merely possible but
-- unremarked, and any integer at all is accepted in the column that decides how
-- a coupon's money was divided.
--
-- This is the same failure mode as 083: a guard that reads as present, is
-- present, and protects nothing. It is only visible by reading the constraint
-- definition rather than its name.
--
-- Units changed with the name and the range must change with the units: the
-- column holds basis points now, so the ceiling is 10000, not 100. Restoring
-- `<= 100` here would reject every voucher above one percent.
--
-- Idempotent, forward-only.

-- ---------------------------------------------------------------------------
-- 1. Retire the constraint that survived onto the wrong column
-- ---------------------------------------------------------------------------

ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_platform_percent_range;

-- ---------------------------------------------------------------------------
-- 2. Backfill, then re-impose the range in the units the column now uses
--
--    Only rows that still have the legacy value to convert from can be
--    recovered. A row with neither is one this migration must not invent a
--    split for; section 3 declines to add NOT NULL in that case rather than
--    fabricate one to satisfy it.
-- ---------------------------------------------------------------------------

UPDATE public.vouchers
SET platform_bp = round(platform_percent_legacy * 100)::integer
WHERE platform_bp IS NULL
  AND platform_percent_legacy IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vouchers'::regclass
      AND conname = 'vouchers_platform_bp_range'
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_platform_bp_range
      CHECK (platform_bp IS NULL OR (platform_bp >= 0 AND platform_bp <= 10000)) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE public.vouchers VALIDATE CONSTRAINT vouchers_platform_bp_range;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE
    '087: vouchers_platform_bp_range stays NOT VALID, an existing row is outside 0..10000. New rows are still checked.';
END $$;

-- ---------------------------------------------------------------------------
-- 3. NOT NULL, but only where it is honest
--
--    Adding NOT NULL to a column holding NULLs fails the whole migration, and
--    the repair for that is a decision about real money on real vouchers, not
--    something to guess at inside a DDL file. When such a row exists the
--    migration says so loudly and leaves the column nullable; the CHECK above
--    still constrains every value that IS written.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing FROM public.vouchers WHERE platform_bp IS NULL;

  IF v_missing > 0 THEN
    RAISE WARNING
      '087: % voucher row(s) carry no platform_bp; leaving the column nullable. Set the split on those rows and re-run.',
      v_missing;
  ELSE
    ALTER TABLE public.vouchers ALTER COLUMN platform_bp SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.vouchers.platform_bp IS
  'Basis points of the prepayment the platform keeps, snapshotted from the product at issue. No default: a voucher whose split was never set is a bug, not a 100 percent platform take (073, restored by 087). 3000 means 30 percent.';
