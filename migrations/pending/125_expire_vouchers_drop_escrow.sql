-- ============================================================================
-- PENDING: expire_vouchers() -- remove the last escrow branch
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS FINISHES
-- ----------------------------------------------------------------------------
--
-- Migration 085 (`085_voucher_scan_audit_and_no_escrow.sql`, applied
-- 2026-07-31) removed the abolished escrow model from `redeem_voucher()`. Its
-- reasoning applies word for word to `expire_vouchers()`, which it did not
-- touch, and which still carries this in production -- read off pg_proc on
-- 2026-08-10, not from the file chain:
--
--     UPDATE public.escrow_holds
--     SET status = 'refunded', refunded_at = now()
--     WHERE voucher_id = ANY(coalesce(v_ids, ARRAY[]::uuid[]))
--       AND status = 'held';
--
-- THE MODEL. Ofir reversed C11 version b on 2026-07-28: the whole coupon
-- prepayment is the platform's at the moment of payment, the supplier receives
-- nothing from us on a coupon, and there is no hold to release or refund. A
-- scan flips one voucher status and moves no money; an expiry does the same and
-- then credits the CUSTOMER's wallet, which is `credit_expired_vouchers()` and
-- is deliberately a separate function.
--
-- WHY IT IS DEAD RATHER THAN WRONG. Measured against production: `escrow_holds`
-- holds 2 rows, both `held`, and BOTH have `voucher_id IS NULL` -- they are
-- `coupon_code_id` holds written before the reversal. `voucher_id = ANY(...)`
-- therefore matches nothing and this branch has never fired. It is removed for
-- the reason 085 gave for the identical branch: this project has twice been
-- bitten by a money path that looked alive and was not, and the fix is to
-- delete the dead branch rather than leave it reading as though the platform
-- still moves money when a voucher expires.
--
-- WHAT THIS DOES NOT DO. It does not touch the 2 legacy `escrow_holds` rows.
-- They are a money state, and deciding what a hold that can no longer be
-- released or refunded should become is Ofir's call, not this migration's.
-- They are reported rather than rewritten. Same for the 2 `order_items` that
-- still carry `settlement_status = 'escrow_held'` and non-zero
-- `escrow_held_agorot` / `escrow_release_agorot`; the application already
-- ignores those columns (`supplierDueAgorot` in src/lib/supplier/dashboard.ts)
-- and `src/server/queries/orders.ts` already maps the legacy statuses onto
-- `split_executed` for display.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.expire_vouchers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  -- Flip every due voucher. This is the whole function now: a status change,
  -- and a count for the caller to log. No money moves here. The customer's
  -- refund for an unscanned expired voucher is credit_expired_vouchers(), kept
  -- separate precisely because it moves money and this does not (C6: expiry is
  -- not forfeiture).
  WITH swept AS (
    UPDATE public.vouchers
    SET status = 'expired'::public.voucher_status,
        status_reason = coalesce(status_reason, 'auto-expired')
    WHERE status = 'issued'::public.voucher_status
      AND expires_at <= now()
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM swept;

  RETURN coalesce(array_length(v_ids, 1), 0);
END;
$function$;

-- ============================================================================
-- VERIFICATION (after applying)
-- ============================================================================
--
-- 1. The function no longer mentions escrow at all (expect false):
--
--      SELECT pg_get_functiondef(p.oid) ILIKE '%escrow%'
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'expire_vouchers';
--
-- 2. It still sweeps. With no due vouchers this returns 0 and writes nothing:
--
--      SELECT public.expire_vouchers();
--
-- 3. The legacy holds are untouched (expect the same 2 rows, still `held`):
--
--      SELECT id, status, voucher_id, coupon_code_id FROM public.escrow_holds;
--
-- ROLLBACK: re-create the function with the UPDATE public.escrow_holds block
-- restored. It is quoted in full in the header above.
-- ============================================================================
