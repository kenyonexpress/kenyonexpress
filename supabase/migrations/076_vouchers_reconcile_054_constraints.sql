-- 076_vouchers_reconcile_054_constraints.sql
--
-- Repairs a database whose `vouchers` table was created by 054 rather than 073.
--
-- 073 was adapted before it was applied to production, precisely because 054
-- encodes the abolished C11(a) rule in the schema:
--
--     CONSTRAINT vouchers_platform_percent_full CHECK (platform_percent = 100)
--     platform_percent numeric(5,2) NOT NULL DEFAULT 100
--
-- Under C11(a) the platform kept the entire prepayment, so 100 was the only
-- legal value. Under C11(b) the split is per product, and every live product
-- carries 15, 25 or 30. That CHECK therefore rejects EVERY voucher the shop can
-- issue.
--
-- Production never had the problem: 073 went in as an adapted CREATE TABLE with
-- a range check. A local database does, and silently: 054 creates the table,
-- then 073's CREATE TABLE IF NOT EXISTS sees it already there and does nothing.
-- So `supabase db reset` produces a developer database on which the entire
-- coupon path fails at the first insert, with a constraint error that names a
-- rule nobody has believed since 2026-07-27.
--
-- On production this migration is a no-op: the constraint is already absent and
-- the range check already present. It exists so the two agree by running the
-- same files, not by remembering which ones were hand-adapted.
--
-- Idempotent, forward-only. Depends on: 054 or 073 (whichever created vouchers).

-- The abolished rule, dropped wherever it survives.
ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_platform_percent_full;

-- DEFAULT 100 is the same rule written as a default: a voucher issued without
-- an explicit split would record a full platform take rather than failing.
-- 073's comment is explicit that there is no default for exactly this reason.
ALTER TABLE public.vouchers
  ALTER COLUMN platform_percent DROP DEFAULT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vouchers'::regclass
      AND conname = 'vouchers_platform_percent_range'
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_platform_percent_range
      CHECK (platform_percent >= 0 AND platform_percent <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.vouchers.platform_percent IS
  'Snapshot of products.platform_percent at issue. No default: a voucher whose split was never set is a bug, not a 100 percent platform take.';
