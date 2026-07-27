-- 079_payout_escrow_release.sql
-- Closes the last open money item of the 2026-07-27 decision (docs/CONTRADICTIONS.md
-- C11 version b): the supplier gets the remainder of the on-site prepayment once
-- the voucher is redeemed.
--
-- Two defects are fixed here, both in generate_payout_statement:
--
--   1. MONEY BUG (C11 b). 027 and 051 wrote coupon_redemption lines with
--      payout_ils = 0 and called them "informational". That was correct under
--      the 24.07 model where the platform kept the whole prepayment. Under the
--      current model the platform keeps platform_percent of the prepayment and
--      the rest is HELD for the supplier until redemption, so a payout run that
--      pays 0 on a redeemed voucher underpays the supplier by exactly the
--      released hold. The line now pays escrow_holds.release_agorot.
--
--   2. STALE COLUMN NAMES. 051 predates 059_money_integer_units, which renamed
--      order_items.total_price_ils -> total_price_agorot,
--      supplier_payout_ils -> supplier_payout_agorot and
--      platform_percent -> platform_bp (old names kept as *_legacy). The 051
--      body still reads the pre-059 names, so on a post-059 database it raises
--      undefined_column on the first call: the payout engine is dead code today.
--
-- What does NOT change: T+3 business-day hold and the 100 ILS minimum with
-- rollover (C8, migration 051), the order-time snapshot rule (C10), and the
-- fact that the balance the customer pays at the counter never reaches the
-- platform and never appears in a payout.
--
-- Idempotent, forward-only. Depends on 027 (payout engine), 047 (escrow_holds),
-- 051 (T+3 + minimum), 059 (integer money units), 073/074 (vouchers, release).

-- ---------------------------------------------------------------------------
-- 0. Guards: this migration rewrites a function over four other migrations
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.payout_statements') IS NULL
     OR to_regclass('public.payout_statement_lines') IS NULL THEN
    RAISE EXCEPTION '079 requires 027_suppliers (payout engine missing)';
  END IF;

  IF to_regclass('public.escrow_holds') IS NULL THEN
    RAISE EXCEPTION '079 requires 047_checkout_settlement (escrow_holds missing)';
  END IF;

  IF to_regclass('public.vouchers') IS NULL THEN
    RAISE EXCEPTION '079 requires 073_vouchers_escrow_model (vouchers missing)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items'
      AND column_name = 'total_price_agorot'
  ) THEN
    RAISE EXCEPTION
      '079 assumes the post-059 integer money units. Apply 059_money_integer_units first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'payout_available_at'
  ) THEN
    RAISE EXCEPTION '079 requires 051_payout_terms (T+3 helpers missing)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. A payout line can point at a voucher
-- ---------------------------------------------------------------------------
-- coupon_code_id points at the legacy instance table. Every voucher issued
-- since 073 lives in `vouchers`, so a redemption line had no way to name its
-- own subject.
ALTER TABLE public.payout_statement_lines
  ADD COLUMN IF NOT EXISTS voucher_id uuid REFERENCES public.vouchers(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.payout_statement_lines.voucher_id IS
  'The redeemed voucher this line pays out for (C11 b). Mutually exclusive with order_item_id; coupon_code_id is the pre-073 equivalent.';

CREATE INDEX IF NOT EXISTS payout_statement_lines_voucher_idx
  ON public.payout_statement_lines (voucher_id) WHERE voucher_id IS NOT NULL;

-- The 027 CHECK demanded order_item_id OR coupon_code_id OR adjustment, so a
-- voucher-only line would have been rejected.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.payout_statement_lines'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%coupon_code_id%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%voucher_id%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payout_statement_lines DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE public.payout_statement_lines
    ADD CONSTRAINT payout_statement_lines_has_subject
    CHECK (
      order_item_id IS NOT NULL
      OR coupon_code_id IS NOT NULL
      OR voucher_id IS NOT NULL
      OR line_type = 'adjustment'::public.payout_line_type
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. generate_payout_statement: current column names + escrow release
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

  -- ---- vouchers redeemed in the period: the released escrow --------------
  -- C11 (b). gross is the prepayment the customer paid ON SITE, not the face
  -- value: the balance is collected in cash at the counter and never touches
  -- the platform, so it is not ours to pay out. The split is read from the
  -- hold that redeem_voucher() released, not recomputed, so a payout can never
  -- disagree with the ledger. Only released holds are collected: a voucher
  -- whose hold is still 'held' has not been redeemed, and one that was
  -- 'refunded' went back to the customer wallet on expiry (C6).
  INSERT INTO public.payout_statement_lines
    (statement_id, line_type, voucher_id, description, quantity,
     gross_ils, platform_percent, platform_fee_ils, payout_ils, available_at)
  SELECT
    v_statement_id,
    'coupon_redemption'::public.payout_line_type,
    v.id,
    COALESCE(p.name_he, 'voucher'),
    1,
    v.coupon_price_agorot / 100.0,
    v.platform_bp / 100.0,
    eh.commission_agorot / 100.0,
    eh.release_agorot / 100.0,
    public.add_business_days(v.redeemed_at, v_hold_days)
  FROM public.vouchers v
  JOIN public.escrow_holds eh ON eh.voucher_id = v.id
  LEFT JOIN public.products p ON p.id = v.product_id
  WHERE v.supplier_id = p_supplier_id
    AND v.status = 'redeemed'::public.voucher_status
    AND eh.status = 'released'::public.escrow_status
    AND v.redeemed_at >= p_period_start
    AND v.redeemed_at <  p_period_end + 1
    AND public.add_business_days(v.redeemed_at, v_hold_days) <= p_as_of
    AND NOT EXISTS (
      SELECT 1
      FROM public.payout_statement_lines l
      JOIN public.payout_statements s ON s.id = l.statement_id
      WHERE l.voucher_id = v.id
        AND s.status <> 'cancelled'::public.payout_status
        AND s.id <> v_statement_id
    );

  -- ---- legacy coupon_codes redeemed in the period -------------------------
  -- Pre-073 instances. Same rule, same source of truth: whatever their hold
  -- released. A legacy code with no hold row is skipped rather than paid 0,
  -- because "no hold" means the money was never split and paying a guess is
  -- how a reconciliation gap is born.
  INSERT INTO public.payout_statement_lines
    (statement_id, line_type, coupon_code_id, description, quantity,
     gross_ils, platform_percent, platform_fee_ils, payout_ils, available_at)
  SELECT
    v_statement_id,
    'coupon_redemption'::public.payout_line_type,
    cc.id,
    COALESCE(p.name_he, 'coupon'),
    1,
    eh.held_agorot / 100.0,
    cc.platform_bp / 100.0,
    eh.commission_agorot / 100.0,
    eh.release_agorot / 100.0,
    public.add_business_days(cc.used_at, v_hold_days)
  FROM public.coupon_codes cc
  JOIN public.escrow_holds eh ON eh.coupon_code_id = cc.id
  LEFT JOIN public.products p ON p.id = cc.product_id
  WHERE cc.supplier_id = p_supplier_id
    AND cc.status = 'used'::public.coupon_status
    AND eh.status = 'released'::public.escrow_status
    AND cc.used_at >= p_period_start
    AND cc.used_at <  p_period_end + 1
    AND public.add_business_days(cc.used_at, v_hold_days) <= p_as_of
    AND cc.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.payout_statement_lines l
      JOIN public.payout_statements s ON s.id = l.statement_id
      WHERE l.coupon_code_id = cc.id
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

  -- C8: below the minimum the balance rolls over instead of being paid.
  -- The lines are DELETED, not just orphaned under a cancelled statement, for
  -- the same reason cancel_payout_statement deletes them: a line that still
  -- names a voucher would collide with the one-live-line-per-voucher index in
  -- section 3 when the next run legitimately picks that voucher up again. The
  -- frozen totals and the note below are what the rolled-over run is audited by.
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
  'Builds a payout statement from order-time snapshots and released escrow holds. Physical lines pay the snapshotted supplier_payout_agorot; redeemed vouchers pay the released hold (C11 b) instead of the pre-2026-07-27 zero. Collects only lines past their T+3 business-day hold and rolls the run over when the balance is below the supplier minimum (C8).';

REVOKE ALL ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz)
  TO authenticated;

DROP FUNCTION IF EXISTS public.generate_payout_statement(uuid, date, date);

-- ---------------------------------------------------------------------------
-- 3. A redeemed voucher must not be paid twice
-- ---------------------------------------------------------------------------
-- The NOT EXISTS guards above are per-run. This index is the invariant: at most
-- one live (non-cancelled) statement line may pay a given voucher, forever.
CREATE UNIQUE INDEX IF NOT EXISTS payout_statement_lines_one_live_voucher
  ON public.payout_statement_lines (voucher_id)
  WHERE voucher_id IS NOT NULL;
