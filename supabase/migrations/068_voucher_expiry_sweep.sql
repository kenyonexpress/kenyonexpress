-- ============================================================================
-- 068_voucher_expiry_sweep.sql
--
-- Voucher lifecycle closer: issued -> expired once expires_at passes.
-- Redemption is already expiry-safe at scan time (the 054 predicate re-checks
-- expires_at inside the atomic UPDATE), so this sweep only settles the
-- bookkeeping status; it moves NO money (expiry = breakage, final rules).
--
-- Idempotent: CREATE OR REPLACE + conditional UPDATE. Safe to run repeatedly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.expire_vouchers(p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_expired integer := 0;
BEGIN
  -- Service-role / postgres only: this is a background job, not a user verb.
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'unauthorized');
  END IF;

  WITH doomed AS (
    SELECT id FROM public.vouchers
    WHERE status = 'issued'::public.voucher_status
      AND expires_at <= now()
    ORDER BY expires_at
    LIMIT greatest(1, least(p_limit, 10000))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.vouchers v
  SET status = 'expired'::public.voucher_status,
      status_reason = coalesce(v.status_reason, 'expired_by_sweep')
  FROM doomed
  WHERE v.id = doomed.id
    AND v.status = 'issued'::public.voucher_status;

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN jsonb_build_object('outcome', 'success', 'expired', v_expired);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_vouchers(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_vouchers(integer) FROM anon, authenticated;

COMMENT ON FUNCTION public.expire_vouchers(integer) IS
  'Background sweep: flips past-due issued vouchers to expired. No money moves (breakage). Called from the cron route with the service role.';
