-- 152: the payout machinery, which production never received.
--
-- MEASURED 2026-09-02: `admin/payouts.ts` calls generate_payout_statement,
-- approve_payout_statement, mark_payout_statement_paid and
-- cancel_payout_statement; the supplier payouts page reads payout_statements.
-- In production NONE of it exists -- not the tables, not the functions, not
-- the supplier payout-terms columns. Only the payout_status enum is there
-- (all five values, pending_approval included). Every payout action has
-- failed at runtime since the module shipped: the FIFTH instance of the
-- closeout's pattern, a whole subsystem present on one side of the wire and
-- absent on the other.
--
-- A faithful port, not a redesign: the payout sections of 027 (sequence,
-- tables, RLS, approve/paid/cancel), 051 (business-day math, payout-terms
-- knobs, the availability trigger), and 079 (voucher lines + the generate
-- that supersedes both earlier ones), stitched in dependency order with their
-- own idempotency guards. Provenance comments mark each seam. 083 contributes
-- nothing here: its enum value is verified already present.
--
-- Verified before writing: audit_log_trigger_fn, is_supplier_member and
-- order_items.delivered_at / fulfilled_at all exist in production, so every
-- reference below resolves.
--
-- ROLLBACK: drop triggers enforce_payout_availability and
-- audit_payout_statements; drop the four statement functions and the two 051
-- helpers; drop payout_statement_lines then payout_statements; drop the
-- sequence; drop the 051 supplier/statement columns. The enum predates this
-- file and stays.
--
-- DRY RUN, 2026-09-02, against production in a transaction that was rolled
-- back (is_admin shimmed to true inside that transaction only, so the
-- machinery is exercised and not just the gate):
--
--   generate=OK status=cancelled rolled=t   -- 0 eligible lines in the period,
--                                              total below the 100 ILS floor,
--                                              rolled over exactly per C8
--   approve  -> 'statement not found or not pending approval'
--   paid     -> 'statement not found or not approved'
--   cancel   -> 'statement not found or already paid/cancelled'
--
-- i.e. every verb ran against the real schema and the state machine enforced
-- itself on a rolled-over statement. One composition bug was found and fixed
-- BY the dry run: 027's grants named a 3-arg generate signature, before the
-- 4-arg definition existed.
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_line_type') THEN
    -- Values exactly as 027 declares them.
    CREATE TYPE public.payout_line_type AS ENUM ('physical_delivery', 'coupon_redemption', 'adjustment');
  END IF;
END $$;


-- ===== from 027: sequence, tables, indexes =====

-- ---------------------------------------------------------------------------
-- 14. Payout engine
-- ---------------------------------------------------------------------------

-- set_updated_at is referenced by the trigger below and does not exist in
-- production (verified 2026-09-02), so the canonical two-liner ships here.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.payout_statement_number_seq;

CREATE TABLE IF NOT EXISTS public.payout_statements (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_number       text        UNIQUE NOT NULL
    DEFAULT ('PS-' || lpad(nextval('public.payout_statement_number_seq')::text, 6, '0')),
  supplier_id            uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  period_start           date        NOT NULL,
  period_end             date        NOT NULL,
  status                 public.payout_status NOT NULL DEFAULT 'draft'::public.payout_status,
  total_gross_ils        numeric(12,2) NOT NULL DEFAULT 0,
  total_platform_fee_ils numeric(12,2) NOT NULL DEFAULT 0,
  total_payout_ils       numeric(12,2) NOT NULL DEFAULT 0,
  approved_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  paid_at                timestamptz,
  payment_reference      text,
  bank_snapshot          jsonb,      -- bank details frozen at payment time
  notes                  text,
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);

-- one live statement per supplier per period (cancelled ones do not block)
CREATE UNIQUE INDEX IF NOT EXISTS payout_statements_period_uq
  ON public.payout_statements (supplier_id, period_start, period_end)
  WHERE status <> 'cancelled'::public.payout_status;

CREATE INDEX IF NOT EXISTS payout_statements_supplier_idx
  ON public.payout_statements (supplier_id, period_start DESC);
CREATE INDEX IF NOT EXISTS payout_statements_status_idx
  ON public.payout_statements (status);

DROP TRIGGER IF EXISTS set_updated_at ON public.payout_statements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payout_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payout_statement_lines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id     uuid        NOT NULL REFERENCES public.payout_statements(id) ON DELETE CASCADE,
  line_type        public.payout_line_type NOT NULL,
  order_item_id    uuid        REFERENCES public.order_items(id) ON DELETE RESTRICT,
  coupon_code_id   uuid        REFERENCES public.coupon_codes(id) ON DELETE RESTRICT,
  description      text,
  quantity         int         NOT NULL DEFAULT 1,
  gross_ils        numeric(12,2) NOT NULL DEFAULT 0,
  platform_percent numeric(5,2),
  platform_fee_ils numeric(12,2) NOT NULL DEFAULT 0,
  payout_ils       numeric(12,2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (
    order_item_id IS NOT NULL
    OR coupon_code_id IS NOT NULL
    OR line_type = 'adjustment'::public.payout_line_type
  )
);

CREATE INDEX IF NOT EXISTS payout_statement_lines_statement_idx
  ON public.payout_statement_lines (statement_id);
CREATE INDEX IF NOT EXISTS payout_statement_lines_order_item_idx
  ON public.payout_statement_lines (order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payout_statement_lines_coupon_idx
  ON public.payout_statement_lines (coupon_code_id) WHERE coupon_code_id IS NOT NULL;

-- Generate (or fail loudly if a live statement exists) a statement for one
-- supplier and period. Uses ONLY snapshotted amounts from order time.

-- ===== from 051: business-day math, payout-terms knobs, statement columns =====
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


-- ===== from 027: approve / mark paid / cancel + grants =====
CREATE OR REPLACE FUNCTION public.approve_payout_statement(p_statement_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.payout_statements
  SET status = 'approved'::public.payout_status,
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_statement_id
    AND status = 'pending_approval'::public.payout_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement not found or not pending approval';
  END IF;
END;
$$;

-- Marks paid + freezes the bank details used. Blocked while disputes are open.
CREATE OR REPLACE FUNCTION public.mark_payout_statement_paid(
  p_statement_id      uuid,
  p_payment_reference text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_statement public.payout_statements%ROWTYPE;
  v_bank      jsonb;
  v_has_disputes boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_statement FROM public.payout_statements
  WHERE id = p_statement_id FOR UPDATE;

  IF NOT FOUND OR v_statement.status <> 'approved'::public.payout_status THEN
    RAISE EXCEPTION 'statement not found or not approved';
  END IF;

  -- ADAPTED FOR PRODUCTION, 2026-09-02: supplier_disputes does not exist
  -- there (neither does its enum). The check runs when the table arrives and
  -- costs nothing until then. Dynamic SQL, because a static reference would
  -- fail the function at first call even with the IF around it.
  IF to_regclass('public.supplier_disputes') IS NOT NULL THEN
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.supplier_disputes WHERE statement_id = %L AND status::text IN (%L, %L))',
      p_statement_id, 'open', 'in_review')
    INTO STRICT v_has_disputes;
    IF v_has_disputes THEN
      RAISE EXCEPTION 'statement has open disputes';
    END IF;
  END IF;

  -- ADAPTED FOR PRODUCTION, 2026-09-02: supplier_bank_accounts does not
  -- exist there and suppliers carries no bank columns, so 027's refusal would
  -- make mark_paid permanently uncallable -- the exact disease this file
  -- cures. The transfer itself happens OUTSIDE the system (a bank upload);
  -- p_payment_reference is the audit anchor. When a bank table lands, the
  -- snapshot resumes automatically.
  IF to_regclass('public.supplier_bank_accounts') IS NOT NULL THEN
    EXECUTE format(
      'SELECT jsonb_build_object(''account_holder_name'', account_holder_name, ''bank_code'', bank_code, ''branch_code'', branch_code, ''account_number'', account_number) FROM public.supplier_bank_accounts WHERE supplier_id = %L AND is_active',
      v_statement.supplier_id)
    INTO v_bank;
  END IF;

  UPDATE public.payout_statements
  SET status = 'paid'::public.payout_status,
      paid_at = now(),
      payment_reference = p_payment_reference,
      bank_snapshot = v_bank
  WHERE id = p_statement_id;
END;
$$;

-- Cancel deletes the lines so the underlying items become settleable again.
CREATE OR REPLACE FUNCTION public.cancel_payout_statement(p_statement_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.payout_statements
  SET status = 'cancelled'::public.payout_status
  WHERE id = p_statement_id
    AND status IN ('draft'::public.payout_status,
                   'pending_approval'::public.payout_status,
                   'approved'::public.payout_status);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement not found or already paid/cancelled';
  END IF;

  DELETE FROM public.payout_statement_lines WHERE statement_id = p_statement_id;
END;
$$;

-- (the generate grants moved BELOW its definition; 027 granted a 3-arg
--  signature that 079's 4-arg replacement never had, and before creation)
REVOKE ALL ON FUNCTION public.approve_payout_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payout_statement(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_payout_statement_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payout_statement_paid(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_payout_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_payout_statement(uuid) TO authenticated;


-- ===== from 051: availability enforcement on the paid transition =====
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

-- ===== from 079: voucher lines + the authoritative generate =====
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
  -- ADAPTED FOR PRODUCTION, 2026-09-02. 079 was written for the post-059
  -- schema (total_price_agorot, platform_bp, supplier_payout_agorot); the
  -- hosted database is the pre-059 lineage and has none of those columns, so
  -- the verbatim port would 42703 on first call. The line MIRRORS THE BOOKS
  -- production actually keeps: commission_agorot is the fee settlement booked
  -- and supplier_immediate_agorot is what settlement-events records as
  -- supplier_due -- the payout can never disagree with the ledger because it
  -- IS the ledger's numbers.
  SELECT
    v_statement_id,
    'physical_delivery'::public.payout_line_type,
    oi.id,
    COALESCE(p.name_he, 'order item'),
    oi.quantity,
    oi.total_price_ils,
    oi.platform_percent,
    oi.commission_agorot / 100.0,
    oi.supplier_immediate_agorot / 100.0,
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
    -- pre-059 lineage: percent, not basis points
    v.platform_percent,
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

  -- THE LEGACY coupon_codes SECTION FROM 079 IS DELIBERATELY NOT PORTED.
  -- Production's coupon_codes has a different shape (redeemed_at not used_at,
  -- platform_percent not platform_bp, no deleted_at) AND holds no pre-073
  -- instances to pay: porting queries against columns that do not exist, for
  -- rows that do not exist, buys a 42703 and nothing else. The 079 text
  -- remains in supabase/migrations/ if that era ever needs exhuming.

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

REVOKE ALL ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz) TO authenticated;

-- ===== from 027: RLS, policies, audit trigger =====
ALTER TABLE public.payout_statements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_statement_lines ENABLE ROW LEVEL SECURITY;
-- ---- payout_statements: members see non-draft statements of their supplier
DROP POLICY IF EXISTS "payout_statements: member select" ON public.payout_statements;
CREATE POLICY "payout_statements: member select"
  ON public.payout_statements FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND status <> 'draft'::public.payout_status
    AND public.is_supplier_member(supplier_id)
  );

DROP POLICY IF EXISTS "payout_statements: admin all" ON public.payout_statements;
CREATE POLICY "payout_statements: admin all"
  ON public.payout_statements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- payout_statement_lines
DROP POLICY IF EXISTS "payout_lines: member select" ON public.payout_statement_lines;
CREATE POLICY "payout_lines: member select"
  ON public.payout_statement_lines FOR SELECT TO authenticated
  USING (
    statement_id IN (
      SELECT id FROM public.payout_statements
      WHERE deleted_at IS NULL
        AND status <> 'draft'::public.payout_status
        AND public.is_supplier_member(supplier_id)
    )
  );

DROP POLICY IF EXISTS "payout_lines: admin all" ON public.payout_statement_lines;
CREATE POLICY "payout_lines: admin all"
  ON public.payout_statement_lines FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS audit_payout_statements ON public.payout_statements;
CREATE TRIGGER audit_payout_statements
  AFTER INSERT OR UPDATE OR DELETE ON public.payout_statements
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

