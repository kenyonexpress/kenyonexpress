-- 088_expire_vouchers_unambiguous.sql
--
-- LOCAL ONLY. NOT APPLIED TO PRODUCTION.
--
-- `SELECT public.expire_vouchers()` fails:
--
--     42725  function public.expire_vouchers() is not unique
--     HINT:  Could not choose a best candidate function.
--
-- Two definitions exist and BOTH accept a call with no arguments:
--
--     068  expire_vouchers(p_limit integer DEFAULT 1000) RETURNS jsonb
--     074  expire_vouchers()                             RETURNS integer
--
-- A default argument makes the one-parameter form a candidate for a zero-
-- argument call, so the two are indistinguishable at that call site and
-- Postgres refuses to guess. Neither migration is wrong on its own; they were
-- written six weeks apart and the collision only exists once both are applied.
--
-- WHAT IT COSTS. src/app/api/cron/expire-vouchers/route.ts calls
-- `admin.rpc('expire_vouchers')` with no arguments and then
-- `credit_expired_vouchers()`. The first call errors, the route logs and
-- returns, and the second never runs. So:
--
--   * no voucher is ever swept to `expired`, and
--   * C6 - "expiry is not forfeiture", the customer is refunded to their wallet
--     what they paid online - never happens for anybody.
--
-- Nothing raises where a person would see it. The route catches the error and
-- reports it in a log line, so the symptom is money quietly not being returned
-- to customers whose vouchers lapsed.
--
-- THE FIX IS TO REMOVE THE DEFAULT, NOT TO DROP EITHER FUNCTION. Both are
-- reachable and both are wanted: the no-argument form is what the cron and the
-- test harness call, and the bounded form exists so a large backlog can be
-- swept in batches. Dropping the parameterless one would leave the cron passing
-- no argument to a function that still requires one; dropping the bounded one
-- would throw away the batching. Removing only the DEFAULT keeps both APIs and
-- makes the zero-argument call resolve to exactly one of them.
--
-- Idempotent, forward-only. No table, column or type is touched, and neither
-- function body changes.

-- ---------------------------------------------------------------------------
-- Postgres has no ALTER FUNCTION ... DROP DEFAULT. Changing a parameter default
-- means replacing the function, and CREATE OR REPLACE cannot change the
-- signature's defaults either, so the bounded form is dropped and recreated
-- with the same body and the default removed.
--
-- The body below is 068's verbatim, and 068 is the only definition of the
-- bounded form; if that file changes, this one has to change with it.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.expire_vouchers(integer);

CREATE OR REPLACE FUNCTION public.expire_vouchers(p_limit integer)
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
  'Background sweep, bounded to p_limit rows. The argument is REQUIRED: a default made this indistinguishable from expire_vouchers() and broke every zero-argument call, including the cron (088). Flips past-due issued vouchers to expired; the money leg is credit_expired_vouchers().';

COMMENT ON FUNCTION public.expire_vouchers() IS
  'Background sweep of every past-due voucher. This is the form the cron route and tests/sql/voucher_redemption_lifecycle.sql call.';
