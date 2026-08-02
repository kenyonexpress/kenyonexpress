-- 051_payout_terms.sql
-- Business decision 2026-07-24 (docs/CONTRADICTIONS.md C8):
--   Supplier payout is released T+3 BUSINESS DAYS after the money event, and a
--   statement only goes out once the accrued balance reaches the minimum
--   (100 ILS). Below the minimum the balance ROLLS OVER to the next run rather
--   than being paid or dropped.
--
-- Israeli business week: Sunday..Thursday are business days, Friday and
-- Saturday are the weekend. dow: 0=Sun .. 5=Fri, 6=Sat.
--
-- Depends on 027_suppliers (payout_statements / payout_statement_lines).
-- Idempotent, forward-only.

-- ---------------------------------------------------------------------------
-- 0. Guard: this migration is meaningless without the 027 payout engine.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.payout_statements') IS NULL
     OR to_regclass('public.payout_statement_lines') IS NULL THEN
    RAISE EXCEPTION
      '051_payout_terms requires 027_suppliers (payout_statements / payout_statement_lines missing)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. T+3 business-day calculator
-- ---------------------------------------------------------------------------
-- STABLE, not IMMUTABLE: resolving a named zone depends on the timezone
-- database, so this must never be inlined into an index or a CHECK.
CREATE OR REPLACE FUNCTION public.add_business_days(p_from timestamptz, p_days integer)
RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_cursor timestamptz := p_from;
  v_left   integer     := p_days;
BEGIN
  IF p_from IS NULL THEN
    RETURN NULL;
  END IF;

  WHILE v_left > 0 LOOP
    v_cursor := v_cursor + interval '1 day';
    -- skip Friday (5) and Saturday (6) in Asia/Jerusalem
    IF EXTRACT(dow FROM (v_cursor AT TIME ZONE 'Asia/Jerusalem')) NOT IN (5, 6) THEN
      v_left := v_left - 1;
    END IF;
  END LOOP;

  RETURN v_cursor;
END;
$$;

COMMENT ON FUNCTION public.add_business_days(timestamptz, integer) IS
  'Adds N Israeli business days (Sun-Thu) to a timestamp. Used for the T+3 payout hold (CONTRADICTIONS C8).';

CREATE OR REPLACE FUNCTION public.payout_available_at(p_event_at timestamptz)
RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT public.add_business_days(p_event_at, 3)
$$;

COMMENT ON FUNCTION public.payout_available_at(timestamptz) IS
  'T+3 business days after the money event. A payout line is not eligible before this moment (CONTRADICTIONS C8): chargeback guard.';

-- ---------------------------------------------------------------------------
-- 2. Policy knobs
-- ---------------------------------------------------------------------------
-- Platform-wide floor, overridable per supplier. This is a PAYOUT THRESHOLD,
-- not a commission default: C1 forbids defaults for platform_percent only.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS min_payout_ils numeric(12,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS payout_hold_business_days integer NOT NULL DEFAULT 3;

DO $$
BEGIN
  ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_min_payout_nonneg CHECK (min_payout_ils >= 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$
BEGIN
  ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_payout_hold_nonneg CHECK (payout_hold_business_days >= 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMENT ON COLUMN public.suppliers.min_payout_ils IS
  'Minimum accrued balance before a payout statement is issued (CONTRADICTIONS C8, default 100 ILS). Below it, the balance rolls over to the next run.';
COMMENT ON COLUMN public.suppliers.payout_hold_business_days IS
  'Chargeback hold before a line becomes payable, in Israeli business days (CONTRADICTIONS C8, default 3 = T+3).';

-- Per-statement audit of when the run became payable / why it rolled over.
ALTER TABLE public.payout_statements
  ADD COLUMN IF NOT EXISTS available_at    timestamptz,
  ADD COLUMN IF NOT EXISTS min_payout_ils  numeric(12,2),
  ADD COLUMN IF NOT EXISTS rolled_over     boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payout_statements.available_at IS
  'Latest T+3 moment across this statement lines: the statement is not payable before it (CONTRADICTIONS C8).';
COMMENT ON COLUMN public.payout_statements.min_payout_ils IS
  'Threshold snapshot in force when this statement was generated. Frozen so later policy changes do not rewrite history.';
COMMENT ON COLUMN public.payout_statements.rolled_over IS
  'true when the run was cancelled because the balance was below the minimum; its lines are free to be picked up by the next run.';

-- Per-line eligibility moment.
ALTER TABLE public.payout_statement_lines
  ADD COLUMN IF NOT EXISTS available_at timestamptz;

COMMENT ON COLUMN public.payout_statement_lines.available_at IS
  'T+3 business days after the line money event (delivery / redemption). Lines are only collected once this has passed.';

CREATE INDEX IF NOT EXISTS payout_statements_available_idx
  ON public.payout_statements (available_at)
  WHERE available_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. generate_payout_statement: enforce T+3 and the minimum
-- ---------------------------------------------------------------------------
-- Same contract and same money source as 027 (order-time snapshots only).
-- Two behavioural changes:
--   a. a line is collected only once its T+3 has elapsed (as of p_as_of);
--   b. if the resulting payout is below the supplier minimum, the statement is
--      cancelled with rolled_over = true so the lines roll into the next run.
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

  -- physical items delivered in the period whose T+3 hold has elapsed
  INSERT INTO public.payout_statement_lines
    (statement_id, line_type, order_item_id, description, quantity,
     gross_ils, platform_percent, platform_fee_ils, payout_ils, available_at)
  SELECT
    v_statement_id,
    'physical_delivery'::public.payout_line_type,
    oi.id,
    COALESCE(p.name_he, 'order item'),
    oi.quantity,
    oi.total_price_ils,
    oi.commission_percent,
    oi.total_price_ils - oi.supplier_payout_ils,
    oi.supplier_payout_ils,
    public.add_business_days(COALESCE(oi.delivered_at, oi.fulfilled_at), v_hold_days)
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.supplier_id = p_supplier_id
    AND oi.product_type = 'physical'::public.product_type
    AND oi.item_status = 'delivered'::public.order_item_status
    AND COALESCE(oi.delivered_at, oi.fulfilled_at) >= p_period_start
    AND COALESCE(oi.delivered_at, oi.fulfilled_at) <  p_period_end + 1
    -- C8: T+3 chargeback hold must have elapsed
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

  -- coupons redeemed in the period: informational lines, payout 0
  -- (customer paid the remainder at the business; platform_paid is our revenue)
  INSERT INTO public.payout_statement_lines
    (statement_id, line_type, coupon_code_id, description, quantity,
     gross_ils, platform_percent, platform_fee_ils, payout_ils, available_at)
  SELECT
    v_statement_id,
    'coupon_redemption'::public.payout_line_type,
    cc.id,
    COALESCE(p.name_he, 'coupon'),
    1,
    COALESCE(cc.face_value_ils, 0),
    cc.platform_percent,
    COALESCE(cc.platform_paid_ils, 0),
    0,
    public.add_business_days(cc.used_at, v_hold_days)
  FROM public.coupon_codes cc
  LEFT JOIN public.products p ON p.id = cc.product_id
  WHERE cc.supplier_id = p_supplier_id
    AND cc.status = 'used'::public.coupon_status
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
  -- Cancelling frees the lines (the NOT EXISTS guards above ignore cancelled
  -- statements), so the next run picks them up together with newer ones.
  IF v_total_payout < v_min_payout THEN
    UPDATE public.payout_statements
    SET status      = 'cancelled'::public.payout_status,
        rolled_over = true,
        notes       = concat_ws(' ', notes,
                        format('Rolled over: payout %s ILS is below the %s ILS minimum (C8).',
                               v_total_payout, v_min_payout))
    WHERE id = v_statement_id;
  END IF;

  RETURN v_statement_id;
END;
$$;

COMMENT ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz) IS
  'Builds a payout statement from order-time snapshots. Collects only lines past their T+3 business-day hold, and rolls the run over (cancelled + rolled_over) when the balance is below the supplier minimum (CONTRADICTIONS C8).';

REVOKE ALL ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz)
  TO authenticated;

-- The 3-arg 027 signature would still resolve and would bypass both rules.
DROP FUNCTION IF EXISTS public.generate_payout_statement(uuid, date, date);

-- ---------------------------------------------------------------------------
-- 4. Payment gate: never pay a statement before its T+3 moment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_payout_availability()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'paid'::public.payout_status
     AND OLD.status IS DISTINCT FROM 'paid'::public.payout_status THEN

    IF NEW.available_at IS NOT NULL AND NEW.available_at > now() THEN
      RAISE EXCEPTION
        'payout statement % is under the T+3 hold until % (CONTRADICTIONS C8)',
        NEW.statement_number, NEW.available_at;
    END IF;

    IF NEW.min_payout_ils IS NOT NULL AND NEW.total_payout_ils < NEW.min_payout_ils THEN
      RAISE EXCEPTION
        'payout statement % is % ILS, below the % ILS minimum (CONTRADICTIONS C8)',
        NEW.statement_number, NEW.total_payout_ils, NEW.min_payout_ils;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_payout_availability ON public.payout_statements;
CREATE TRIGGER enforce_payout_availability
  BEFORE UPDATE ON public.payout_statements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payout_availability();
