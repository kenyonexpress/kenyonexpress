-- 092_redeem_voucher_order_item.sql
--
-- Ships the redeem path that migration 073 deliberately omitted, and ties a
-- successful scan to order_items.settlement_status = 'redeemed'.
--
-- Why not apply 054 verbatim: 073 already created vouchers / voucher_redemptions
-- under the live money model. This file only adds the SECURITY DEFINER RPCs
-- (success payload, redeem_voucher, log_voucher_scan) plus the order_items write.
--
-- Single-use is the conditional UPDATE ... WHERE status = 'issued' ... RETURNING.
-- Apply via MCP apply_migration only (never db push).
--
-- Depends on: 073 (vouchers, voucher_redemptions, enums), 019 (rate limit),
-- 072 (supplier_members), 047/066 (settlement_status including 'redeemed').

CREATE OR REPLACE FUNCTION public.voucher_success_payload(v public.vouchers)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT jsonb_build_object(
    'outcome',                     'success',
    'voucher_id',                  v.id,
    'order_item_id',               v.order_item_id,
    'code',                        v.code,
    'status',                      v.status::text,
    'product_name',                (SELECT p.name_he FROM public.products p WHERE p.id = v.product_id),
    'supplier_name',               (SELECT s.name FROM public.suppliers s WHERE s.id = v.supplier_id),
    'customer_name',               (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = v.user_id),
    'face_value_agorot',           v.face_value_agorot,
    'coupon_price_agorot',         v.coupon_price_agorot,
    'remaining_amount_due_agorot', v.remaining_amount_due_agorot,
    'redeemed_at',                 v.redeemed_at,
    'offer_valid_until',           v.offer_valid_until
  );
$$;

CREATE OR REPLACE FUNCTION public.redeem_voucher(
  p_code            text,
  p_scan_method     text DEFAULT 'manual',
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_code           text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_method         text := CASE WHEN p_scan_method IN ('camera', 'manual') THEN p_scan_method ELSE 'manual' END;
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
      (code_entered, scanned_by, scan_method, outcome)
    VALUES
      (left(v_code, 32), v_uid, v_method, 'unauthorized'::public.voucher_scan_outcome);
    RETURN jsonb_build_object('outcome', 'unauthorized');
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 0 THEN
    SELECT * INTO v_prior
    FROM public.voucher_redemptions
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
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

  IF NOT public.check_user_rate_limit(v_uid, 'voucher_scan', 30, 60) THEN
    INSERT INTO public.voucher_redemptions
      (code_entered, scanned_by, scan_method, outcome, idempotency_key)
    VALUES
      (left(v_code, 32), v_uid, v_method, 'rate_limited'::public.voucher_scan_outcome, p_idempotency_key);
    RETURN jsonb_build_object('outcome', 'rate_limited');
  END IF;

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

    -- Reflect redemption on the order line. settlement_status already carries
    -- 'redeemed' (047). item_status has no redeemed label; leave issued.
    UPDATE public.order_items
    SET settlement_status = 'redeemed'::public.settlement_status,
        updated_at = now()
    WHERE id = v_voucher.order_item_id
      AND settlement_status IN (
        'platform_settled'::public.settlement_status,
        'paid'::public.settlement_status,
        'escrow_held'::public.settlement_status
      );
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
        v_outcome := 'expired'::public.voucher_scan_outcome;
      END IF;
    END IF;

    v_voucher := v_probe;
  END IF;

  INSERT INTO public.voucher_redemptions
    (voucher_id, code_entered, supplier_id, scanned_by, scan_method, outcome,
     idempotency_key, amount_collected_agorot)
  VALUES
    (v_voucher.id, left(v_code, 32), v_supplier_id, v_uid, v_method, v_outcome,
     p_idempotency_key,
     CASE WHEN v_outcome = 'success'::public.voucher_scan_outcome
          THEN v_voucher.remaining_amount_due_agorot END);

  IF v_outcome = 'success'::public.voucher_scan_outcome THEN
    RETURN public.voucher_success_payload(v_voucher);
  ELSIF v_outcome = 'already_redeemed'::public.voucher_scan_outcome THEN
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
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_voucher_scan(
  p_code_entered text,
  p_scan_method  text DEFAULT 'manual',
  p_outcome      text DEFAULT 'invalid_signature'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_outcome public.voucher_scan_outcome;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF p_outcome NOT IN ('invalid_signature', 'invalid_request', 'not_found') THEN
    v_outcome := 'invalid_request'::public.voucher_scan_outcome;
  ELSE
    v_outcome := p_outcome::public.voucher_scan_outcome;
  END IF;

  INSERT INTO public.voucher_redemptions
    (code_entered, supplier_id, scanned_by, scan_method, outcome)
  VALUES (
    left(coalesce(p_code_entered, ''), 32),
    (SELECT supplier_id FROM public.supplier_members
      WHERE user_id = v_uid AND is_active ORDER BY created_at LIMIT 1),
    v_uid,
    CASE WHEN p_scan_method IN ('camera', 'manual') THEN p_scan_method ELSE 'manual' END,
    v_outcome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.voucher_success_payload(public.vouchers) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_voucher(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.log_voucher_scan(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_voucher_scan(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.redeem_voucher(text, text, text) IS
  'Atomic issued→redeemed scan. On success also sets order_items.settlement_status=redeemed. 092.';
