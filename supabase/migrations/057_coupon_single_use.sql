-- ============================================================================
-- 057_coupon_single_use.sql  (spec number 036; renumbered 033->050 ... 039->056
-- because 033-035 already exist in this tree and 049 was the last used
-- number; see LEDGER-DESIGN.md section 0)
--
-- Coupon redemption single-use hardening. This tree's coupon_status enum is
-- issued / used / expired / refunded (there is no 'active' value).
--
-- RACE-SAFE CLAIM (the only legal redemption path, service role, single CAS
-- statement; the loser of a concurrent race matches 0 rows and gets
-- already_used):
--   UPDATE public.coupon_codes
--   SET status = 'used'::public.coupon_status,
--       redeemed_at = now(),
--       redeemed_by_merchant_user_id = $merchant_user
--   WHERE code = $1
--     AND supplier_id = $scanner_supplier
--     AND status = 'issued'::public.coupon_status
--     AND expires_at > now()
--   RETURNING *;
--   -- then INSERT INTO coupon_redemptions (UNIQUE coupon_code_id)
--
-- Enforcement layers:
--   1. Partial unique index on coupon_codes: at most one 'used' row per code
--      (future-proof if the global unique on code is relaxed for reissues).
--   2. coupon_redemptions.coupon_code_id UNIQUE: at most one redemption row.
--   3. Status transition trigger: terminal states (used/expired/refunded) can
--      never change; only issued may transition; redemption facts are locked
--      once used.
--
-- ROLLBACK NOTE: additive only. To roll back:
--   DROP TRIGGER IF EXISTS trg_coupon_codes_guard_transitions ON public.coupon_codes;
--   DROP FUNCTION IF EXISTS public.fn_coupon_codes_guard_transitions();
--   DROP INDEX IF EXISTS public.coupon_codes_one_used_per_code;
--   DROP INDEX IF EXISTS public.coupon_redemptions_one_per_code;
--   ALTER TABLE public.coupon_codes DROP COLUMN IF EXISTS redeemed_by_merchant_user_id;
-- Do NOT drop coupon_redemptions if 026 already ran on the target DB (026
-- owns it there); on DBs where this file created it, DROP TABLE IF EXISTS
-- public.coupon_redemptions.
-- ============================================================================

-- 1. Who redeemed at the business --------------------------------------------

ALTER TABLE public.coupon_codes
  ADD COLUMN IF NOT EXISTS redeemed_by_merchant_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.coupon_codes.redeemed_by_merchant_user_id IS
  'The merchant-side user (scanner/manager/owner) whose claim UPDATE won the redemption race.';

-- 2. At most one redeemed coupon per code ------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS coupon_codes_one_used_per_code
  ON public.coupon_codes (code)
  WHERE status = 'used'::public.coupon_status;

-- 3. coupon_redemptions: one row per successful redemption -------------------
-- Defensive create: 026 owns this table canonically, but some live DB layers
-- sit before 026. Shape matches 026 plus the 051 agorot unit.

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code_id          uuid NOT NULL UNIQUE REFERENCES public.coupon_codes(id) ON DELETE RESTRICT,
  order_item_id           uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  supplier_id             uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  scanned_by              uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  method                  text NOT NULL CHECK (method IN ('camera', 'manual')),
  amount_collected_agorot integer CHECK (amount_collected_agorot >= 0),
  ip                      inet,
  user_agent              text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Explicit single-redemption index; on DBs where 026 created the table the
-- inline UNIQUE already exists and this is a no-op by name.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_one_per_code
  ON public.coupon_redemptions (coupon_code_id);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_supplier
  ON public.coupon_redemptions (supplier_id, created_at DESC);

-- 4. Status transition guard -------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_coupon_codes_guard_transitions()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Only issued coupons may transition; used/expired/refunded are terminal.
    IF OLD.status <> 'issued'::public.coupon_status THEN
      RAISE EXCEPTION 'coupon % status % is terminal; illegal transition to %',
        OLD.id, OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'used'::public.coupon_status THEN
      NEW.redeemed_at := COALESCE(NEW.redeemed_at, now());
    END IF;
  ELSIF OLD.status = 'used'::public.coupon_status THEN
    -- Redemption facts are immutable once redeemed.
    IF NEW.redeemed_at IS DISTINCT FROM OLD.redeemed_at
       OR NEW.redeemed_by_merchant_user_id IS DISTINCT FROM OLD.redeemed_by_merchant_user_id THEN
      RAISE EXCEPTION 'coupon % is used; redemption facts cannot be changed', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coupon_codes_guard_transitions ON public.coupon_codes;
CREATE TRIGGER trg_coupon_codes_guard_transitions
  BEFORE UPDATE ON public.coupon_codes
  FOR EACH ROW EXECUTE FUNCTION public.fn_coupon_codes_guard_transitions();

-- RLS: coupon_codes already enabled + owner read in 046; coupon_redemptions
-- enabled here (may predate 026 policies on this DB layer), policies in 056.
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
