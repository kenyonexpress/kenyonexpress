-- 260_referral_qualified_guard_and_first_time_claim.sql
--
-- Two guards on the referral programme (098, applied), STEP 46.
--
-- MEASURED BEFORE WRITING (production, 2026-10-08, read-only through the
-- management API): fn_claim_referral(uuid,text,text,text),
-- fn_complete_referral(uuid,uuid,integer,text) and fn_pay_referral(uuid,uuid)
-- all exist as 098 wrote them; `referrals` holds 0 rows, `profiles` holds 0
-- minted codes, `referral_program_settings` holds 0 rows (250 pending), and
-- `orders.user_id`, `orders.paid_at`, `orders.referral_code_used` exist.
-- Nothing here has a row to migrate; both changes are to function bodies.
--
-- 1. A QUALIFIED ROW IS NOT RE-DECIDED.
--    098's fn_complete_referral answers `ready_to_pay` on a clean first order
--    and leaves the row `pending` with `referred_first_order_id` set, because
--    the money moves in fn_pay_referral (now called by
--    src/server/referrals/complete.ts). If that pay call fails (reserve
--    missing, wallet missing, transient error), the next paid order from the
--    same customer reaches fn_complete_referral again, finds `pending`, and
--    RE-RUNS the whole decision: the bonus is re-snapshotted at today's terms,
--    `referred_first_order_id` is overwritten with the later order, and past
--    `qualify_by` the row is REJECTED as `qualify_window_expired` although it
--    qualified inside the window. This file makes a row with
--    `referred_first_order_id` already set answer `qualified_unpaid` with its
--    id, so the caller retries the payout and the decision stands.
--
-- 2. ONLY A FIRST-TIME CUSTOMER CAN BE REFERRED.
--    098's claim checks the programme, the code and self-referral, and runs on
--    EVERY sign-in. A customer with paid orders who clicks a friend's link and
--    signs in again becomes "referred", and their next order of ₪50+ pays the
--    friend ₪20 for a customer the shop already had. The claim now answers
--    `existing_customer` when the referred account has any order with
--    `paid_at` set. Signals are still recorded first, as 098 intends.
--
-- 3. THE ORDER IS STAMPED.
--    `orders.referral_code_used` (010) existed and nothing wrote it. The
--    qualifying order now carries the code, so an order row says on its own
--    that it converted a referral, and the account export (which already reads
--    the column) stops exporting a column that was always null.
--
-- Bodies below are 098's with the three insertions marked `-- 260:`. Grants
-- are restated because they are the contract: service_role only.
--
-- ROLLBACK: re-run sections 5 and 7 of
-- supabase/migrations/098_referral_program.sql (CREATE OR REPLACE restores
-- the previous bodies; grants are unchanged).

DO $$
BEGIN
  IF to_regprocedure('public.fn_claim_referral(uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION '260 requires fn_claim_referral (098); apply 098 first';
  END IF;
  IF to_regprocedure('public.fn_complete_referral(uuid,uuid,integer,text)') IS NULL THEN
    RAISE EXCEPTION '260 requires fn_complete_referral (098); apply 098 first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orders'
                    AND column_name = 'referral_code_used') THEN
    RAISE EXCEPTION '260 requires orders.referral_code_used (010)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Claim: first-time customers only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_claim_referral(
  p_referred_user_id uuid,
  p_code             text,
  p_device_hash      text DEFAULT NULL,
  p_ip_hash          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings public.referral_program_settings%rowtype;
  v_referrer uuid;
BEGIN
  SELECT * INTO v_settings FROM public.referral_program_settings WHERE id;
  IF NOT FOUND OR NOT v_settings.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'program_inactive');
  END IF;

  SELECT id INTO v_referrer FROM public.profiles
   WHERE referral_code = upper(btrim(p_code));

  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;

  -- The cheapest fraud check there is, and the one that catches the most.
  IF v_referrer = p_referred_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  -- Signals are recorded even when the claim is later rejected: a device that
  -- shows up across many failed claims is itself the pattern worth seeing.
  IF p_device_hash IS NOT NULL THEN
    INSERT INTO public.referral_signals (user_id, kind, fingerprint)
    VALUES (p_referred_user_id, 'device', p_device_hash)
    ON CONFLICT (user_id, kind, fingerprint)
    DO UPDATE SET last_seen = now(), seen_count = public.referral_signals.seen_count + 1;
  END IF;
  IF p_ip_hash IS NOT NULL THEN
    INSERT INTO public.referral_signals (user_id, kind, fingerprint)
    VALUES (p_referred_user_id, 'ip', p_ip_hash)
    ON CONFLICT (user_id, kind, fingerprint)
    DO UPDATE SET last_seen = now(), seen_count = public.referral_signals.seen_count + 1;
  END IF;

  -- 260: the programme rewards bringing a NEW customer. An account that has
  -- already paid for an order is not one, however it arrived this time.
  IF EXISTS (SELECT 1 FROM public.orders o
              WHERE o.user_id = p_referred_user_id AND o.paid_at IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'existing_customer');
  END IF;

  BEGIN
    INSERT INTO public.referrals (
      referrer_user_id, referred_user_id, referral_code, status, qualify_by
    ) VALUES (
      v_referrer, p_referred_user_id, upper(btrim(p_code)), 'pending',
      now() + make_interval(days => v_settings.qualify_window_days)
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_referred');
  END;

  RETURN jsonb_build_object('ok', true, 'referrer_id', v_referrer);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_referral(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_referral(uuid, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Completion: a qualified row is retried for payout, never re-decided
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_complete_referral(
  p_order_id       uuid,
  p_user_id        uuid,
  p_order_agorot   integer,
  p_card_hash      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings public.referral_program_settings%rowtype;
  v_ref      public.referrals%rowtype;
  v_signals  text[];
  v_month    integer;
  v_year     integer;
BEGIN
  SELECT * INTO v_settings FROM public.referral_program_settings WHERE id;
  IF NOT FOUND OR NOT v_settings.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'program_inactive');
  END IF;

  -- The lock. Two orders finishing together for the same referred user would
  -- otherwise both find status = 'pending' and both pay a bonus.
  SELECT * INTO v_ref FROM public.referrals
   WHERE referred_user_id = p_user_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referral'); END IF;

  -- Idempotent: a retried webhook on an order that already completed the
  -- referral is success, not a second payout.
  IF v_ref.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_resolved', 'status', v_ref.status);
  END IF;

  -- 260: the first order already qualified and the bonus is snapshotted; only
  -- the payout is outstanding. Answer with the id so the caller retries
  -- fn_pay_referral, and leave the decision, the amount and the order alone.
  IF v_ref.referred_first_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'qualified_unpaid', 'referral_id', v_ref.id);
  END IF;

  IF v_ref.qualify_by IS NOT NULL AND now() > v_ref.qualify_by THEN
    UPDATE public.referrals
       SET status = 'rejected', rejection_reason = 'qualify_window_expired', updated_at = now()
     WHERE id = v_ref.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'window_expired');
  END IF;

  IF p_order_agorot < v_settings.min_order_agorot THEN
    -- Not a rejection: a later, larger order inside the window still qualifies.
    RETURN jsonb_build_object('ok', false, 'reason', 'below_minimum');
  END IF;

  -- The card only becomes known at payment, which is why this signal is
  -- recorded here and not at claim time.
  IF p_card_hash IS NOT NULL THEN
    INSERT INTO public.referral_signals (user_id, kind, fingerprint)
    VALUES (p_user_id, 'card', p_card_hash)
    ON CONFLICT (user_id, kind, fingerprint)
    DO UPDATE SET last_seen = now(), seen_count = public.referral_signals.seen_count + 1;
  END IF;

  v_signals := public.fn_referral_fraud_signals(v_ref.referrer_user_id, p_user_id);

  -- Caps, counted from paid referrals only. A referrer at their monthly limit
  -- is not fraud, so the referral waits for review rather than being refused.
  SELECT count(*) INTO v_month FROM public.referrals
   WHERE referrer_user_id = v_ref.referrer_user_id AND status = 'completed'
     AND paid_at > now() - interval '30 days';
  SELECT count(*) INTO v_year FROM public.referrals
   WHERE referrer_user_id = v_ref.referrer_user_id AND status = 'completed'
     AND paid_at > now() - interval '365 days';

  IF v_month >= v_settings.max_per_referrer_month THEN
    v_signals := v_signals || 'monthly_cap';
  END IF;
  IF v_year >= v_settings.max_per_referrer_year THEN
    v_signals := v_signals || 'yearly_cap';
  END IF;

  UPDATE public.referrals
     SET referred_first_order_id = p_order_id,
         referrer_bonus_agorot   = v_settings.referrer_bonus_agorot,
         referred_bonus_agorot   = v_settings.referred_bonus_agorot,
         flagged_reasons         = NULLIF(v_signals, ARRAY[]::text[]),
         status = CASE
                    WHEN array_length(v_signals, 1) IS NOT NULL THEN 'flagged'::public.referral_status
                    WHEN v_settings.require_manual_approval    THEN 'flagged'::public.referral_status
                    ELSE 'pending'::public.referral_status
                  END,
         updated_at = now()
   WHERE id = v_ref.id;

  -- 260: the order says on its own that it converted a referral. 010 made the
  -- column and nothing ever wrote it.
  UPDATE public.orders
     SET referral_code_used = v_ref.referral_code
   WHERE id = p_order_id AND referral_code_used IS NULL;

  IF array_length(v_signals, 1) IS NOT NULL OR v_settings.require_manual_approval THEN
    -- Held for a person. Nothing is credited here: the whole point of the queue
    -- is that money does not move until someone looked.
    RETURN jsonb_build_object('ok', true, 'reason', 'held_for_review', 'signals', v_signals);
  END IF;

  RETURN jsonb_build_object('ok', true, 'reason', 'ready_to_pay', 'referral_id', v_ref.id);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_complete_referral(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_complete_referral(uuid, uuid, integer, text) TO service_role;

-- Self-check: both bodies carry the 260 branches, and neither function is
-- executable by a client role.
DO $$
DECLARE
  v_claim    text := pg_get_functiondef('public.fn_claim_referral(uuid,text,text,text)'::regprocedure);
  v_complete text := pg_get_functiondef('public.fn_complete_referral(uuid,uuid,integer,text)'::regprocedure);
BEGIN
  IF position('existing_customer' IN v_claim) = 0 THEN
    RAISE EXCEPTION '260: fn_claim_referral lacks the existing_customer guard';
  END IF;
  IF position('qualified_unpaid' IN v_complete) = 0 THEN
    RAISE EXCEPTION '260: fn_complete_referral lacks the qualified_unpaid answer';
  END IF;
  IF position('referral_code_used' IN v_complete) = 0 THEN
    RAISE EXCEPTION '260: fn_complete_referral does not stamp orders.referral_code_used';
  END IF;
  IF has_function_privilege('anon', 'public.fn_claim_referral(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_claim_referral(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_complete_referral(uuid,uuid,integer,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_complete_referral(uuid,uuid,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '260: a client role can execute a referral function';
  END IF;
  RAISE NOTICE '260: claim refuses existing customers; completion retries payout on a qualified row; orders stamped';
END $$;
