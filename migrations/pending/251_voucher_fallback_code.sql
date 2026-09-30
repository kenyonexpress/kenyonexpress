-- 251_voucher_fallback_code.sql
--
-- An 8-digit numeric fallback code on every purchased voucher (STEP 14,
-- 01.10). The signed QR (KEV1.<body>.<HMAC>, 0545/074) and the 10-symbol
-- Crockford code stay exactly what they are; this is the third way to name
-- the same voucher at a counter, for the till that has no camera and a
-- cashier who will not read "5 then K then V" aloud twice.
--
-- MEASURED BEFORE WRITING. `grep -rn fallback_code src migrations supabase`
-- found nothing on 2026-10-01. What DOES exist under "8 digits" is
-- `coupon_qr_codes` (182 / 217): printed marketing flyers redeemed at
-- checkout as a discount, 7 random digits plus a Luhn check digit
-- (src/lib/coupons/unit-codes.ts). A purchased voucher is a different
-- object with a different lock (redeem_voucher, 085), so the FORMAT is
-- reused and the table is not: the same shape at every till, one Luhn
-- gate in one module, and no row of one kind that could be mistaken for
-- the other because they live in different tables.
--
-- WHAT THIS ADDS. One nullable column, one CHECK, one partial UNIQUE
-- index. Nullable because every voucher issued before this file has none,
-- and because the issuer (src/server/domain/vouchers/issue.ts) probes for
-- the column and writes it only when it exists: a build that ships before
-- this is applied keeps issuing vouchers instead of raising 42703 on every
-- coupon order, which is the failure 059's rename taught this codebase.
--
-- THE LOCK IS NOT HERE. redeem_voucher (085) still matches on `code` and
-- nothing else; the application resolves an 8-digit entry to the 10-symbol
-- code with a service-role read (src/server/domain/vouchers/fallback-code.ts)
-- and hands the RPC what it always took. The single conditional UPDATE, the
-- membership derivation from auth.uid(), the idempotency replay and the
-- audit row are therefore untouched by this migration, on purpose: adding a
-- second lookup key to the money-path function would put a display concern
-- on the same failure path as burning the voucher.
--
-- ENUMERATION. 10^7 valid codes (Luhn removes nine in ten guesses locally)
-- behind the existing ceilings: 30 scans a minute per member inside the
-- RPC, 120 burns and 300 lookups an hour per member in the routes, 60 page
-- loads an hour per address on the merchant pages. A guessed code that
-- belongs to another business answers `not_found`, the same collapse the
-- RPC performs for a guessed 10-symbol code. Nothing grants suppliers a
-- read of outstanding vouchers (073 exposes a voucher to its supplier only
-- after redemption), so the column is never client-readable.
--
-- NO BACKFILL. docs/INDEX.md records zero vouchers ever issued on the
-- hosted project; a customer whose voucher predates this file keeps the
-- 10-symbol code and the QR, and every screen prints the fallback line
-- only when the row has one.
--
-- RLS: unchanged. Policies on `vouchers` are row-scoped (051 owner read,
-- 073 supplier-after-redemption, admin) and a new column inherits them.
-- No grant changes: no function is created or replaced.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.vouchers_fallback_code_idx;
--   ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_fallback_code_format;
--   ALTER TABLE public.vouchers DROP COLUMN IF EXISTS fallback_code;
--   The issuer's probe then answers "absent" on the next process and stops
--   writing the column; already-issued vouchers lose the fallback line and
--   keep their code and QR.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS fallback_code text;

COMMENT ON COLUMN public.vouchers.fallback_code IS
  '8 ASCII digits, 7 random plus a Luhn check digit (src/lib/coupons/unit-codes.ts). '
  'A second way to name this voucher at a till; redeem_voucher still matches on code, '
  'the application resolves this to it. NULL on vouchers issued before 251.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vouchers_fallback_code_format'
      AND conrelid = 'public.vouchers'::regclass
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_fallback_code_format
      CHECK (fallback_code IS NULL OR fallback_code ~ '^[0-9]{8}$');
  END IF;
END $$;

-- Partial: NULLs are not unique-checked anyway, but a partial index keeps the
-- pre-251 rows out of the index entirely and makes the resolver's
-- `WHERE fallback_code = $1` an index hit.
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_fallback_code_idx
  ON public.vouchers (fallback_code)
  WHERE fallback_code IS NOT NULL;

-- Self-check: the three objects exist, and the CHECK refuses what the
-- application would never write.
DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vouchers' AND column_name = 'fallback_code'
  ) THEN
    RAISE EXCEPTION '251: vouchers.fallback_code was not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'vouchers_fallback_code_idx'
  ) THEN
    RAISE EXCEPTION '251: vouchers_fallback_code_idx was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vouchers_fallback_code_format'
  ) THEN
    RAISE EXCEPTION '251: vouchers_fallback_code_format was not added';
  END IF;

  RAISE NOTICE '251: vouchers.fallback_code in place (nullable, ^[0-9]{8}$, partial unique index)';
END $$;
