-- 098_referral_program.sql
--
-- The referral program: a code per user, a wallet credit on the referred
-- person's first purchase, a fraud guard, and a queue for a human to judge what
-- the guard flags.
--
-- Requires 097 (referral_status gains 'flagged'). Kept separate because an enum
-- value cannot be used in the transaction that adds it.
--
-- WHAT ALREADY EXISTED AND IS NOT REBUILT
--
-- public.referrals has been here since 010, with referrer, referred, code,
-- status and a first-order pointer. It is extended rather than replaced. What
-- it never had is anything that decides when a referral completes, anything
-- that moves money when it does, and any signal at all about whether the two
-- accounts are the same person.
--
-- THE RULE THIS FILE IS ORGANISED AROUND
--
-- A referral bonus is the easiest money in the system to steal: it costs one
-- extra email address. So nothing here credits a wallet on a claim, on a
-- signup, or on an order being placed. The credit happens once, on a PAID first
-- order, above a minimum, inside a function that holds a lock, keyed by an
-- idempotency string, and only after two fraud checks have not fired.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Program settings: one row, no hardcoded money anywhere else
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_program_settings (
  id                        boolean PRIMARY KEY DEFAULT true,

  -- Agorot. Both sides, because a program that pays only the referrer gets
  -- shared far less than one that pays both.
  referrer_bonus_agorot     integer NOT NULL,
  referred_bonus_agorot     integer NOT NULL,

  -- The referred person's first order must clear this before anything is paid.
  -- Without it the cheapest item in the catalogue is the price of a bonus.
  min_order_agorot          integer NOT NULL,

  -- How long after signup the first order still counts.
  qualify_window_days       integer NOT NULL DEFAULT 14,

  -- Caps per referrer. The single most effective anti-farming control there is,
  -- because it bounds the payout of a compromised or fraudulent account without
  -- needing to detect anything.
  max_per_referrer_month    integer NOT NULL DEFAULT 5,
  max_per_referrer_year     integer NOT NULL DEFAULT 30,

  -- When true, every completion waits for a human even if nothing was flagged.
  -- The setting to reach for while the program is new and the fraud patterns
  -- are not yet known.
  require_manual_approval   boolean NOT NULL DEFAULT false,

  is_active                 boolean NOT NULL DEFAULT false,
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT referral_settings_single_row CHECK (id),
  CONSTRAINT referral_settings_amounts CHECK (
    referrer_bonus_agorot >= 0
    AND referred_bonus_agorot >= 0
    AND min_order_agorot >= 0
    AND qualify_window_days > 0
    AND max_per_referrer_month > 0
    AND max_per_referrer_year >= max_per_referrer_month
  )
);

-- No seed row with invented amounts. CONTRADICTIONS C1 is about
-- platform_percent, but the principle is the same one and it is the reason a
-- bonus figure is not going to be guessed here: the program stays off until a
-- person enters what it pays.
COMMENT ON TABLE public.referral_program_settings IS
  'Single row. Deliberately unseeded: is_active stays false and the program '
  'does nothing until someone sets what it pays. No bonus amount is invented.';

ALTER TABLE public.referral_program_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_settings_admin_read ON public.referral_program_settings;
CREATE POLICY referral_settings_admin_read ON public.referral_program_settings
  FOR SELECT TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. A code per user
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

/**
 * Mints a code for a user, once, and returns it on every later call.
 *
 * Crockford base32 minus the letters that are misread aloud: no I, L, O or U.
 * A referral code is dictated across a table and typed from a screenshot more
 * often than it is clicked, so 1/l/I and 0/O confusion is the failure mode
 * worth designing out. Eight characters over a 32-symbol alphabet is 2^40,
 * which is not guessable at any rate this endpoint will ever allow.
 */
CREATE OR REPLACE FUNCTION public.fn_ensure_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code     text;
  v_existing text;
  v_alphabet CONSTANT text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  i integer;
BEGIN
  SELECT referral_code INTO v_existing FROM public.profiles WHERE id = p_user_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- Bounded retry rather than a loop with no exit: a collision at 2^40 is
  -- vanishingly unlikely, and an unbounded loop on a unique index is how a
  -- signup hangs forever the day something else is wrong.
  FOR attempt IN 1..10 LOOP
    v_code := '';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;

    BEGIN
      UPDATE public.profiles SET referral_code = v_code
       WHERE id = p_user_id AND referral_code IS NULL;
      IF FOUND THEN RETURN v_code; END IF;
      -- Someone else minted one concurrently.
      SELECT referral_code INTO v_existing FROM public.profiles WHERE id = p_user_id;
      IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- code taken, try again
    END;
  END LOOP;

  RAISE EXCEPTION 'could not mint a unique referral code after 10 attempts';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ensure_referral_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ensure_referral_code(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The signals the fraud guard reads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- 'device' | 'card' | 'ip'. Text rather than an enum so a new signal does not
  -- need an ALTER TYPE and its own migration.
  kind        text NOT NULL CHECK (kind IN ('device', 'card', 'ip')),

  -- A HASH, never the raw value.
  --
  -- A card fingerprint here is brand+last4+expiry hashed with a server salt,
  -- and an IP is hashed too. Storing either in the clear would put payment
  -- identifiers and location data into a growth table that has a much wider
  -- read surface than payment_tokens does, to answer a question that only ever
  -- needs equality.
  fingerprint text NOT NULL,

  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  seen_count  integer NOT NULL DEFAULT 1,

  CONSTRAINT referral_signals_unique UNIQUE (user_id, kind, fingerprint)
);

CREATE INDEX IF NOT EXISTS referral_signals_lookup_idx
  ON public.referral_signals (kind, fingerprint);

ALTER TABLE public.referral_signals ENABLE ROW LEVEL SECURITY;

-- No policy at all: deny-all to every browser role. These are fraud signals
-- about people, and nothing in the app has any reason to read them from a
-- client. Only the service role, which bypasses RLS by role, touches them.
COMMENT ON TABLE public.referral_signals IS
  'Hashed device / card / IP fingerprints, for referral fraud detection only. '
  'RLS on with zero policies: deny-all to anon and authenticated by design. '
  'Values are hashed with a server salt and never stored raw.';

-- ---------------------------------------------------------------------------
-- 4. referrals, extended
-- ---------------------------------------------------------------------------

ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referrer_bonus_agorot integer;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referred_bonus_agorot integer;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS flagged_reasons text[];
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS qualify_by timestamptz;

-- One referral per referred person, ever. The referred side is the scarce one:
-- a person can refer many, but can only ever BE referred once, and without this
-- the same account is worth a bonus to every referrer who reaches it.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_one_per_referred
  ON public.referrals (referred_user_id)
  WHERE referred_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS referrals_review_queue_idx
  ON public.referrals (status, created_at DESC)
  WHERE status IN ('pending', 'flagged') AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Claiming a referral at signup
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
-- 6. The fraud guard
-- ---------------------------------------------------------------------------

/**
 * Returns the reasons this pair looks like one person, or an empty array.
 *
 * Detection only. It never decides an outcome, which is what lets the caller
 * choose between "flag for review" and "reject", and what lets this be tested
 * on its own.
 */
CREATE OR REPLACE FUNCTION public.fn_referral_fraud_signals(
  p_referrer_id uuid,
  p_referred_id uuid
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT reason), ARRAY[]::text[])
  FROM (
    -- Same device: the strongest signal by far. Two accounts that have used one
    -- browser profile are one person until proven otherwise.
    SELECT 'same_device' AS reason
    FROM public.referral_signals a
    JOIN public.referral_signals b
      ON b.kind = a.kind AND b.fingerprint = a.fingerprint
    WHERE a.kind = 'device' AND a.user_id = p_referrer_id AND b.user_id = p_referred_id

    UNION ALL

    -- Same card. Weaker than a device only because families share cards, which
    -- is exactly why this flags for review rather than rejecting outright.
    SELECT 'same_card'
    FROM public.referral_signals a
    JOIN public.referral_signals b
      ON b.kind = a.kind AND b.fingerprint = a.fingerprint
    WHERE a.kind = 'card' AND a.user_id = p_referrer_id AND b.user_id = p_referred_id

    UNION ALL

    -- Same IP is the weakest of the three: a household, an office and a
    -- carrier NAT all look like this. Recorded because it corroborates, never
    -- relied on alone.
    SELECT 'same_ip'
    FROM public.referral_signals a
    JOIN public.referral_signals b
      ON b.kind = a.kind AND b.fingerprint = a.fingerprint
    WHERE a.kind = 'ip' AND a.user_id = p_referrer_id AND b.user_id = p_referred_id
  ) s;
$$;

REVOKE ALL ON FUNCTION public.fn_referral_fraud_signals(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_referral_fraud_signals(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Completion, on a paid first order
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

-- ---------------------------------------------------------------------------
-- 8. Payout, and the admin queue
-- ---------------------------------------------------------------------------

/**
 * Credits both wallets and marks the referral completed.
 *
 * Separate from fn_complete_referral so that approving from the queue and
 * paying automatically run the SAME code. A queue that pays through a different
 * path is a queue whose payouts are not tested.
 */
CREATE OR REPLACE FUNCTION public.fn_pay_referral(p_referral_id uuid, p_approved_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref     public.referrals%rowtype;
  v_reserve uuid;
  v_acct    uuid;
BEGIN
  SELECT * INTO v_ref FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_ref.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_paid');
  END IF;
  IF v_ref.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rejected');
  END IF;

  SELECT id INTO v_reserve FROM public.wallet_accounts WHERE code = 'platform:cashback_reserve';
  IF v_reserve IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_reserve_account');
  END IF;

  -- Referrer.
  IF COALESCE(v_ref.referrer_bonus_agorot, 0) > 0 THEN
    SELECT id INTO v_acct FROM public.wallet_accounts WHERE user_id = v_ref.referrer_user_id;
    IF v_acct IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer_wallet'); END IF;
    PERFORM public.fn_wallet_transfer(
      v_reserve, v_acct,
      (v_ref.referrer_bonus_agorot::numeric / 100),
      'referral_bonus',
      -- Idempotency keyed on the referral and the side, so a retry credits
      -- nothing twice even if this function is called again.
      'referral:' || v_ref.id::text || ':referrer',
      v_ref.referred_first_order_id
    );
  END IF;

  -- Referred.
  IF COALESCE(v_ref.referred_bonus_agorot, 0) > 0 THEN
    SELECT id INTO v_acct FROM public.wallet_accounts WHERE user_id = v_ref.referred_user_id;
    IF v_acct IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referred_wallet'); END IF;
    PERFORM public.fn_wallet_transfer(
      v_reserve, v_acct,
      (v_ref.referred_bonus_agorot::numeric / 100),
      'referral_bonus',
      'referral:' || v_ref.id::text || ':referred',
      v_ref.referred_first_order_id
    );
  END IF;

  UPDATE public.referrals
     SET status = 'completed',
         completed_at = now(),
         paid_at = now(),
         reviewed_by = COALESCE(p_approved_by, reviewed_by),
         reviewed_at = CASE WHEN p_approved_by IS NOT NULL THEN now() ELSE reviewed_at END,
         bonus_paid_amount_ils =
           (COALESCE(v_ref.referrer_bonus_agorot,0) + COALESCE(v_ref.referred_bonus_agorot,0))::numeric / 100,
         updated_at = now()
   WHERE id = v_ref.id;

  RETURN jsonb_build_object('ok', true, 'reason', 'paid');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_pay_referral(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pay_referral(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_reject_referral(
  p_referral_id uuid, p_reason text, p_rejected_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.referrals
     SET status = 'rejected', rejection_reason = p_reason,
         reviewed_by = p_rejected_by, reviewed_at = now(), updated_at = now()
   WHERE id = p_referral_id AND status <> 'completed';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_already_paid');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reject_referral(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reject_referral(uuid, text, uuid) TO service_role;

-- The queue itself.
CREATE OR REPLACE VIEW public.v_referral_review_queue AS
SELECT
  r.id,
  r.status,
  r.created_at,
  r.qualify_by,
  r.flagged_reasons,
  r.referrer_user_id,
  pr.email       AS referrer_email,
  r.referred_user_id,
  pd.email       AS referred_email,
  r.referred_first_order_id,
  r.referrer_bonus_agorot,
  r.referred_bonus_agorot,
  (COALESCE(r.referrer_bonus_agorot,0) + COALESCE(r.referred_bonus_agorot,0)) AS total_bonus_agorot,
  -- How many the referrer has already been paid: the number that turns a
  -- single suspicious pair into a visible pattern.
  (SELECT count(*) FROM public.referrals x
    WHERE x.referrer_user_id = r.referrer_user_id AND x.status = 'completed') AS referrer_paid_count
FROM public.referrals r
LEFT JOIN public.profiles pr ON pr.id = r.referrer_user_id
LEFT JOIN public.profiles pd ON pd.id = r.referred_user_id
WHERE r.deleted_at IS NULL
  AND r.status IN ('pending', 'flagged')
ORDER BY (r.status = 'flagged') DESC, r.created_at DESC;
