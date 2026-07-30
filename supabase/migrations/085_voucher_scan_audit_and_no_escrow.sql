-- 085_voucher_scan_audit_and_no_escrow.sql
--
-- APPLIED TO PRODUCTION 2026-07-31 through apply_migration.
--
-- It had to be: the app calls redeem_voucher() and log_voucher_scan() with five
-- named arguments, production carried the three-argument versions, and PostgREST
-- cannot resolve an RPC by a name set the function does not have. Every scan
-- answered PGRST202, which the route reported as "שגיאת מערכת". Redemption was
-- dead in production and looked like an infrastructure error.
--
-- Verified after applying: exactly one signature per function (the three-arg
-- versions are dropped, not overloaded), ip_address and user_agent present, a
-- session-less call returns {"outcome":"unauthorized"} without writing a row,
-- and voucher_scan_ip('not-an-ip') returns NULL instead of raising 22P02.
--
-- Two things, both about the scan-time path.
--
-- 1. THE AUDIT ROW COULD NOT ANSWER "WHO SCANNED THIS, FROM WHERE".
--    voucher_redemptions has recorded outcome, scanner and timestamp since 073,
--    and it is described in its own COMMENT as "what a dispute is settled with".
--    A dispute over a voucher is a dispute about a physical counter: the
--    supplier says the customer never came, the customer says they scanned it.
--    Neither the network origin nor the device were kept, so the table could
--    say a redemption happened and never say from where. ip_address and
--    user_agent are added here and written on every attempt.
--
--    It also could not record an attempt from someone with no session at all.
--    log_voucher_scan() returned early on auth.uid() IS NULL, so a forged QR
--    opened by an anonymous visitor left no trace - exactly the attempt most
--    worth having. It now accepts a NULL scanner, bounded per IP so the audit
--    table cannot be used as an amplifier (see section 3).
--
-- 2. redeem_voucher() STILL CARRIED THE ABOLISHED ESCROW MODEL.
--    074 was written under C11 version b, where the supplier's share of the
--    prepayment was held from payment until the scan. Ofir reversed that on
--    2026-07-28 (model 035ef8e): the whole coupon prepayment is the platform's
--    at the moment of payment, the supplier receives nothing from us on a
--    coupon, and there is no hold to release. finalize.ts stopped writing
--    escrow_holds and marks the coupon line split_executed on payment.
--
--    The release block in redeem_voucher() is therefore dead code in a money
--    function: WHERE voucher_id = ... AND status = 'held' matches nothing
--    because no voucher hold is ever written, and the order_items flip
--    escrow_held -> escrow_released matches nothing because coupon lines are
--    now split_executed. It is removed rather than left to read as though the
--    platform still moves money on a scan. This project has already been bitten
--    twice by a money path that looked alive and was not (see STATE.md on 081
--    and 083), and the fix is to delete the dead branch, not to comment it.
--
--    A scan under this model moves NO money. It flips one voucher status and
--    tells the counter what to collect in cash. order_items is deliberately not
--    touched: the line was settled at payment, and a line of quantity 3 has
--    three vouchers that are scanned on three different days, so no per-line
--    status could be honest about "redeemed" anyway.
--
-- Idempotent, forward-only. Depends on: 073 (vouchers, voucher_redemptions),
-- 072 (supplier_members), 019 (check_user_rate_limit).

-- ---------------------------------------------------------------------------
-- 1. The audit columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.voucher_redemptions
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text;

COMMENT ON COLUMN public.voucher_redemptions.ip_address IS
  'Network origin of the scan attempt, as the edge reported it. NULL means the caller did not supply one (an older client, or a path that reaches the RPC without an HTTP request), never "unknown attacker".';
COMMENT ON COLUMN public.voucher_redemptions.user_agent IS
  'Client UA string, truncated to 512 chars. Diagnostic only: it is attacker-controlled and no decision may be made from it.';

-- Abuse questions are asked as "what came from this address recently", so the
-- index leads on ip and orders by time. Partial: rows written before this
-- migration, and any future caller that has no IP to give, would otherwise all
-- collide on one NULL key.
CREATE INDEX IF NOT EXISTS voucher_redemptions_ip_idx
  ON public.voucher_redemptions (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. voucher_scan_ip(): parse an address without letting a bad one fail a scan
--
--    Declared before its callers: the plpgsql validator resolves the functions
--    a body calls at CREATE time, so defining this after redeem_voucher() would
--    fail the migration on a fresh database while passing on one where an older
--    copy happened to exist.
--
--    The IP arrives as a header, which is to say as attacker-controlled text.
--    A plain ::inet cast on "not-an-ip" raises 22P02, and that exception would
--    propagate out of redeem_voucher and turn a legitimate redemption at a
--    counter into a 500. Audit fidelity is worth less than the redemption, so a
--    value that will not parse is recorded as NULL and the scan proceeds.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.voucher_scan_ip(p_raw text)
RETURNS inet
LANGUAGE plpgsql IMMUTABLE
SET search_path = public AS $$
DECLARE
  v_clean text := nullif(btrim(coalesce(p_raw, '')), '');
BEGIN
  IF v_clean IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN v_clean::inet;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

COMMENT ON FUNCTION public.voucher_scan_ip(text) IS
  'Header text to inet, NULL on anything unparseable. Never raises: a malformed X-Forwarded-For must not cost a customer their redemption.';

-- ---------------------------------------------------------------------------
-- 3. redeem_voucher(): the only redemption path, now without the escrow leg
--
--    The 3-argument signature is dropped rather than kept alongside. PostgREST
--    resolves an RPC by the set of named arguments in the body, and two
--    overloads where one argument list is a subset of the other is exactly the
--    shape that resolves ambiguously. One signature, no ambiguity.
--
--    Atomicity is unchanged and is the whole point: exactly one conditional
--    UPDATE decides the race. The first transaction to reach it locks the row;
--    a concurrent scan re-evaluates the predicate after that commit, matches
--    zero rows, and reports already_redeemed. There is no read-then-write
--    window to lose.
--
--    Supplier identity comes from supplier_members via auth.uid(), never from
--    the request and never from the QR payload, so a forged payload naming
--    another supplier changes nothing.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.redeem_voucher(text, text, text);

CREATE OR REPLACE FUNCTION public.redeem_voucher(
  p_code            text,
  p_scan_method     text DEFAULT 'manual',
  p_idempotency_key text DEFAULT NULL,
  p_ip              text DEFAULT NULL,
  p_user_agent      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_code           text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_method         text := CASE WHEN p_scan_method IN ('camera', 'manual') THEN p_scan_method ELSE 'manual' END;
  v_ip             inet := public.voucher_scan_ip(p_ip);
  v_ua             text := left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512);
  v_has_membership boolean;
  v_voucher        public.vouchers%ROWTYPE;
  v_probe          public.vouchers%ROWTYPE;
  v_prior          public.voucher_redemptions%ROWTYPE;
  v_outcome        public.voucher_scan_outcome;
  v_supplier_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('outcome', 'unauthorized');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members
    WHERE user_id = v_uid AND is_active
  ) INTO v_has_membership;

  IF NOT v_has_membership THEN
    INSERT INTO public.voucher_redemptions
      (code_entered, scanned_by, scan_method, outcome, ip_address, user_agent)
    VALUES
      (left(v_code, 32), v_uid, v_method, 'unauthorized'::public.voucher_scan_outcome, v_ip, v_ua);
    RETURN jsonb_build_object('outcome', 'unauthorized');
  END IF;

  -- Replay guard: an identical retried request returns the first answer.
  IF p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 0 THEN
    SELECT * INTO v_prior
    FROM public.voucher_redemptions
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      -- Reusing one key for a different code is a client bug, not something to
      -- resolve by guessing which voucher was meant.
      IF v_prior.code_entered IS DISTINCT FROM left(v_code, 32) THEN
        RETURN jsonb_build_object('outcome', 'invalid_request', 'replayed', true);
      END IF;

      IF v_prior.outcome = 'success'::public.voucher_scan_outcome AND v_prior.voucher_id IS NOT NULL THEN
        SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_prior.voucher_id;
        RETURN public.voucher_success_payload(v_voucher) || jsonb_build_object('replayed', true);
      END IF;

      RETURN jsonb_build_object('outcome', v_prior.outcome::text, 'replayed', true);
    END IF;
  END IF;

  -- Brute-force guard over the code space: 30 attempts per minute per user.
  IF NOT public.check_user_rate_limit(v_uid, 'voucher_scan', 30, 60) THEN
    INSERT INTO public.voucher_redemptions
      (code_entered, scanned_by, scan_method, outcome, idempotency_key, ip_address, user_agent)
    VALUES
      (left(v_code, 32), v_uid, v_method, 'rate_limited'::public.voucher_scan_outcome,
       p_idempotency_key, v_ip, v_ua);
    RETURN jsonb_build_object('outcome', 'rate_limited');
  END IF;

  -- The atomic single-use guard. supplier_id must be one of the caller's own
  -- active memberships; status and expiry are re-checked inside the predicate.
  UPDATE public.vouchers v
  SET status                  = 'redeemed'::public.voucher_status,
      redeemed_at             = now(),
      redeemed_by_supplier_id = v.supplier_id,
      redeemed_by_user_id     = v_uid,
      redeemed_amount_collected_agorot = v.remaining_amount_due_agorot
  WHERE v.code = v_code
    AND v.status = 'issued'::public.voucher_status
    AND v.expires_at > now()
    AND v.supplier_id IN (
      SELECT supplier_id FROM public.supplier_members
      WHERE user_id = v_uid AND is_active
    )
  RETURNING v.* INTO v_voucher;

  IF FOUND THEN
    v_outcome     := 'success'::public.voucher_scan_outcome;
    v_supplier_id := v_voucher.supplier_id;
    -- No money leg. Model 035ef8e: the whole prepayment settled to the platform
    -- when the order was paid, and remaining_amount_due_agorot is collected by
    -- the business in cash and never reaches us. Nothing to release, nothing to
    -- transfer, and order_items keeps the settlement it was given at payment.
  ELSE
    SELECT * INTO v_probe FROM public.vouchers WHERE code = v_code;

    IF NOT FOUND THEN
      v_outcome := 'not_found'::public.voucher_scan_outcome;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.supplier_members
      WHERE user_id = v_uid AND is_active AND supplier_id = v_probe.supplier_id
    ) THEN
      v_outcome     := 'wrong_supplier'::public.voucher_scan_outcome;
      v_supplier_id := NULL;
    ELSE
      v_supplier_id := v_probe.supplier_id;
      IF v_probe.status = 'redeemed'::public.voucher_status THEN
        v_outcome := 'already_redeemed'::public.voucher_scan_outcome;
      ELSIF v_probe.status = 'cancelled'::public.voucher_status THEN
        v_outcome := 'cancelled'::public.voucher_scan_outcome;
      ELSIF v_probe.status = 'refunded'::public.voucher_status THEN
        v_outcome := 'refunded'::public.voucher_scan_outcome;
      ELSE
        -- status 'expired', or still 'issued' with expires_at already past
        -- because the sweep has not run yet.
        v_outcome := 'expired'::public.voucher_scan_outcome;
      END IF;
    END IF;

    v_voucher := v_probe;
  END IF;

  INSERT INTO public.voucher_redemptions
    (voucher_id, code_entered, supplier_id, scanned_by, scan_method, outcome,
     idempotency_key, amount_collected_agorot, ip_address, user_agent)
  VALUES
    (v_voucher.id, left(v_code, 32), v_supplier_id, v_uid, v_method, v_outcome,
     p_idempotency_key,
     CASE WHEN v_outcome = 'success'::public.voucher_scan_outcome
          THEN v_voucher.remaining_amount_due_agorot END,
     v_ip, v_ua);

  IF v_outcome = 'success'::public.voucher_scan_outcome THEN
    RETURN public.voucher_success_payload(v_voucher);
  ELSIF v_outcome = 'already_redeemed'::public.voucher_scan_outcome THEN
    -- Honest detail only for the voucher's own supplier.
    RETURN jsonb_build_object(
      'outcome', 'already_redeemed',
      'redeemed_at', v_voucher.redeemed_at
    );
  ELSIF v_outcome = 'expired'::public.voucher_scan_outcome THEN
    RETURN jsonb_build_object(
      'outcome', 'expired',
      'expires_at', v_voucher.expires_at,
      'offer_valid_until', v_voucher.offer_valid_until
    );
  ELSIF v_outcome IN ('cancelled'::public.voucher_scan_outcome,
                      'refunded'::public.voucher_scan_outcome) THEN
    RETURN jsonb_build_object('outcome', v_outcome::text);
  ELSE
    -- not_found and wrong_supplier collapse to one answer (anti-enumeration).
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_voucher(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. log_voucher_scan(): attempts rejected before the database is consulted
--
--    A forged QR fails its HMAC check in the route, so the code it names is
--    never looked up and redeem_voucher() is never called. Without this the
--    single most interesting attempt leaves no record at all.
--
--    The scanner may be NULL now. That is the anonymous forged-token case: a
--    stranger opening /redeem/<forged> has no session, and refusing to record
--    them was the old behaviour precisely for the attempts worth recording.
--
--    Being callable without a session makes the table a write primitive for
--    unauthenticated traffic, so it is bounded: past ANON_BURST rows from one
--    address inside the window the insert is skipped. The abuse is on record
--    ANON_BURST times over; the row after that adds evidence of nothing and
--    costs storage an attacker chooses.
--
--    It still cannot manufacture a success: the outcome is clamped to the
--    app-layer rejection set, so nothing reachable from a client can write a
--    row that looks like a redemption.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.log_voucher_scan(text, text, text);

CREATE OR REPLACE FUNCTION public.log_voucher_scan(
  p_code_entered text,
  p_scan_method  text DEFAULT 'manual',
  p_outcome      text DEFAULT 'invalid_signature',
  p_ip           text DEFAULT NULL,
  p_user_agent   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  ANON_BURST  constant integer := 20;
  ANON_WINDOW constant interval := interval '1 minute';
  v_uid       uuid := auth.uid();
  v_ip        inet := public.voucher_scan_ip(p_ip);
  v_ua        text := left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512);
  v_outcome   public.voucher_scan_outcome;
  v_recent    integer;
BEGIN
  IF p_outcome NOT IN ('invalid_signature', 'invalid_request', 'not_found') THEN
    v_outcome := 'invalid_request'::public.voucher_scan_outcome;
  ELSE
    v_outcome := p_outcome::public.voucher_scan_outcome;
  END IF;

  IF v_uid IS NULL THEN
    -- An address that gives us nothing to key on cannot be bounded, so it is
    -- not admitted. A session-less caller reaches here only through the route,
    -- which always has a request to read an address from.
    IF v_ip IS NULL THEN
      RETURN;
    END IF;

    SELECT count(*) INTO v_recent
    FROM public.voucher_redemptions
    WHERE ip_address = v_ip
      AND scanned_by IS NULL
      AND created_at > now() - ANON_WINDOW;

    IF v_recent >= ANON_BURST THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.voucher_redemptions
    (code_entered, supplier_id, scanned_by, scan_method, outcome, ip_address, user_agent)
  VALUES (
    left(coalesce(p_code_entered, ''), 32),
    CASE WHEN v_uid IS NULL THEN NULL ELSE
      (SELECT supplier_id FROM public.supplier_members
        WHERE user_id = v_uid AND is_active ORDER BY created_at LIMIT 1)
    END,
    v_uid,
    CASE WHEN p_scan_method IN ('camera', 'manual') THEN p_scan_method ELSE 'manual' END,
    v_outcome,
    v_ip,
    v_ua
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_voucher_scan(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_voucher_scan(text, text, text, text, text) TO authenticated, anon, service_role;
