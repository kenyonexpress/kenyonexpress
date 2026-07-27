-- 081_payout_no_escrow.sql
--
-- Supersedes 079_payout_escrow_release.sql, which was cancelled unapplied by the
-- 2026-07-28 model reversal (see the flip section at the top of
-- docs/CONTRADICTIONS.md). 079 bundled two independent fixes, and only one of
-- them died with the escrow model:
--
--   CANCELLED. Paying the supplier the released escrow hold on a redeemed
--   voucher. Under the current model the whole on-site prepayment is platform
--   revenue at payment time, no hold is ever written, and the supplier's income
--   from a coupon is the balance collected at their own counter. There is
--   nothing for us to pay out, so there is no coupon line.
--
--   STILL BROKEN, FIXED HERE. 051's generate_payout_statement predates
--   059_money_integer_units, which renamed order_items.total_price_ils ->
--   total_price_agorot, supplier_payout_ils -> supplier_payout_agorot and
--   platform_percent -> platform_bp (old names kept as *_legacy). The 051 body
--   still reads the pre-059 names, so on any post-059 database the first call
--   raises undefined_column: the payout engine is dead code today. That outlives
--   the escrow question entirely, because it breaks PHYSICAL payouts, which the
--   reversal did not touch.
--
-- Behaviour change against 051 worth stating plainly: 051 wrote informational
-- coupon_redemption lines with payout_ils = 0. This drops them instead of
-- keeping them at zero. A payout statement is a record of money we owe, and a
-- zero line on it reads as a debt that was settled at nothing. How many
-- vouchers a supplier redeemed is a question for the supplier portal and the
-- `vouchers` table, not for a payout run.
--
-- What does NOT change: the T+3 business-day hold and the 100 ILS minimum with
-- rollover (C8, migration 051), the order-time snapshot as the only money source
-- (C10), and the fact that the counter balance never reaches the platform.
--
-- Idempotent, forward-only. Depends on 027 (payout engine), 051 (T+3 + minimum),
-- 059 (integer money units). Deliberately does NOT depend on 047's escrow_holds
-- or on 073's vouchers: neither is read any more.

-- ---------------------------------------------------------------------------
-- 0. Guards
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.payout_statements') IS NULL
     OR to_regclass('public.payout_statement_lines') IS NULL THEN
    RAISE EXCEPTION '081 requires 027_suppliers (payout engine missing)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items'
      AND column_name = 'total_price_agorot'
  ) THEN
    RAISE EXCEPTION
      '081 assumes the post-059 integer money units. Apply 059_money_integer_units first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'payout_available_at'
  ) THEN
    RAISE EXCEPTION '081 requires 051_payout_terms (T+3 helpers missing)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. generate_payout_statement: post-059 column names, physical lines only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_payout_statement(
  p_supplier_id  uuid,
  p_period_start date,
  p_period_end   date,
  p_as_of        timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_statement_id uuid;
  v_hold_days    integer;
  v_min_payout   numeric(12,2);
  v_total_payout numeric(12,2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT COALESCE(s.payout_hold_business_days, 3), COALESCE(s.min_payout_ils, 100)
  INTO v_hold_days, v_min_payout
  FROM public.suppliers s
  WHERE s.id = p_supplier_id;

  IF v_hold_days IS NULL THEN
    RAISE EXCEPTION 'unknown supplier %', p_supplier_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payout_statements
    WHERE supplier_id = p_supplier_id
      AND period_start = p_period_start
      AND period_end   = p_period_end
      AND status <> 'cancelled'::public.payout_status
  ) THEN
    RAISE EXCEPTION 'live statement already exists for this supplier and period';
  END IF;

  INSERT INTO public.payout_statements
    (supplier_id, period_start, period_end, min_payout_ils)
  VALUES (p_supplier_id, p_period_start, p_period_end, v_min_payout)
  RETURNING id INTO v_statement_id;

  -- ---- physical items delivered in the period, past their T+3 hold ---------
  -- Money comes from the order-time snapshot only (C10). platform_bp is the
  -- snapshotted platform_percent in basis points since 059; the fee is the
  -- residual gross - payout rather than the percent applied a second time, so
  -- the line can never disagree with what settlement actually booked.
  --
  -- There is no second INSERT for coupons. That is the whole content of the
  -- 2026-07-28 reversal: a redeemed voucher moves no money through us.
  INSERT INTO public.payout_statement_lines
    (statement_id, line_type, order_item_id, description, quantity,
     gross_ils, platform_percent, platform_fee_ils, payout_ils, available_at)
  SELECT
    v_statement_id,
    'physical_delivery'::public.payout_line_type,
    oi.id,
    COALESCE(p.name_he, 'order item'),
    oi.quantity,
    oi.total_price_agorot / 100.0,
    oi.platform_bp / 100.0,
    (oi.total_price_agorot - oi.supplier_payout_agorot) / 100.0,
    oi.supplier_payout_agorot / 100.0,
    public.add_business_days(COALESCE(oi.delivered_at, oi.fulfilled_at), v_hold_days)
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.supplier_id = p_supplier_id
    AND oi.product_type = 'physical'::public.product_type
    AND oi.item_status = 'delivered'::public.order_item_status
    AND COALESCE(oi.delivered_at, oi.fulfilled_at) >= p_period_start
    AND COALESCE(oi.delivered_at, oi.fulfilled_at) <  p_period_end + 1
    AND public.add_business_days(COALESCE(oi.delivered_at, oi.fulfilled_at), v_hold_days) <= p_as_of
    AND oi.deleted_at IS NULL
    AND o.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.payout_statement_lines l
      JOIN public.payout_statements s ON s.id = l.statement_id
      WHERE l.order_item_id = oi.id
        AND s.status <> 'cancelled'::public.payout_status
        AND s.id <> v_statement_id
    );

  UPDATE public.payout_statements ps
  SET total_gross_ils        = t.gross,
      total_platform_fee_ils = t.fee,
      total_payout_ils       = t.payout,
      available_at           = t.available_at,
      status                 = 'pending_approval'::public.payout_status
  FROM (
    SELECT COALESCE(sum(gross_ils), 0)        AS gross,
           COALESCE(sum(platform_fee_ils), 0) AS fee,
           COALESCE(sum(payout_ils), 0)       AS payout,
           max(available_at)                  AS available_at
    FROM public.payout_statement_lines
    WHERE statement_id = v_statement_id
  ) t
  WHERE ps.id = v_statement_id
  RETURNING ps.total_payout_ils INTO v_total_payout;

  -- C8: below the minimum the balance rolls over instead of being paid. The
  -- lines are DELETED, not left orphaned under a cancelled statement, for the
  -- same reason cancel_payout_statement deletes them: the next run has to be
  -- free to pick the same order items up again. The frozen totals and the note
  -- below are what the rolled-over run is audited by.
  IF v_total_payout < v_min_payout THEN
    UPDATE public.payout_statements
    SET status      = 'cancelled'::public.payout_status,
        rolled_over = true,
        notes       = concat_ws(' ', notes,
                        format('Rolled over: payout %s ILS is below the %s ILS minimum (C8).',
                               v_total_payout, v_min_payout))
    WHERE id = v_statement_id;

    DELETE FROM public.payout_statement_lines WHERE statement_id = v_statement_id;
  END IF;

  RETURN v_statement_id;
END;
$$;

COMMENT ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz) IS
  'Builds a payout statement from order-time snapshots. Physical lines pay the snapshotted supplier_payout_agorot; coupons produce no line at all, because the 2026-07-28 model keeps the whole on-site prepayment as platform revenue and the supplier collects the balance at their counter. Collects only lines past their T+3 business-day hold and rolls the run over when the balance is below the supplier minimum (C8).';

REVOKE ALL ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz)
  TO authenticated;
