-- 116: the payout engine, at the shape THIS database can actually take.
--
-- NOT APPLIED. Nothing in migrations/pending/ has been run.
--
-- The application already knows this feature is missing and says so in Hebrew.
-- `src/server/actions/admin/payouts.ts:58` returns
--
--   'מסך התשלומים לספקים אינו מותקן בבסיס הנתונים הזה: מיגרציה 081 לא הוחלה...'
--
-- on Postgres 42883 / 42P01 from any of the four payout RPCs. Re-measured on
-- 2026-08-12 and still true: zero tables and zero functions matching '%payout%'.
-- All four RPCs the admin screen calls -- `generate_payout_statement`,
-- `approve_payout_statement`, `cancel_payout_statement`,
-- `mark_payout_statement_paid` -- are absent, as are `payout_statements`,
-- `payout_statement_lines`, `supplier_bank_accounts`, the numbering sequence,
-- `add_business_days`, `payout_available_at`, and every payout column on
-- `suppliers`.
--
-- What DOES exist here: both enums, in their final shape.
--   payout_status    = draft, pending_approval, approved, paid, cancelled
--   payout_line_type = physical_delivery, coupon_redemption, adjustment
-- So 083 (which adds pending_approval) has effectively landed and needs no
-- replay. `is_admin()`, `is_supplier_member()`, `is_supplier_owner()` and
-- `set_updated_at()` are all present.
--
-- ===========================================================================
-- WHY THIS IS NOT "APPLY 027, THEN 051, THEN 081"
-- ===========================================================================
--
-- Because 081 refuses to run here, correctly, and its own guard says why:
--
--     IF NOT EXISTS (... column_name = 'total_price_agorot') THEN
--       RAISE EXCEPTION '081 assumes the post-059 integer money units.'
--
-- This database is the pre-059 lineage. `order_items` has `total_price_ils`,
-- `supplier_payout_ils` and `platform_percent` as numeric; it has no
-- `total_price_agorot`, no `supplier_payout_agorot` and no `platform_bp`.
-- 081's function body reads all three of the post-059 names, so applying it
-- would install a payout engine that raises `undefined_column` on its first
-- call -- which is precisely the defect 081 was written to fix, in mirror image.
--
-- 051's body runs against the right column names but carries two things that
-- are wrong here:
--
--   a. It reads `oi.delivered_at`, which does not exist on this
--      `order_items`. Measured: the table has `fulfilled_at` and no
--      `delivered_at`. `COALESCE(oi.delivered_at, oi.fulfilled_at)` is not a
--      null-safety idiom on this database, it is a 42703 waiting to happen.
--      Every reference is reduced to `oi.fulfilled_at` below.
--
--   b. It writes informational `coupon_redemption` lines with payout 0. The
--      2026-07-28 model reversal cancelled those: the whole on-site
--      prepayment is platform revenue at payment time, the supplier collects
--      the balance at their own counter, and we owe nothing on a redeemed
--      voucher. 081 dropped the block for that reason and this file follows it.
--      A zero line on a payout statement reads as a debt settled at nothing.
--      Separately, the block could not run here anyway: it selects
--      `cc.used_at` and `cc.deleted_at`, and this `coupon_codes` has
--      `redeemed_at` and no `deleted_at` at all.
--
-- One more correction of 051, on the money path rather than on a column name.
-- 051 writes `oi.commission_percent` into `payout_statement_lines.platform_percent`.
-- This `order_items` carries BOTH `commission_percent` and `platform_percent`,
-- and AGENTS.md is explicit that the live column for the platform's cut is
-- `platform_percent` -- the one snapshotted at order time and read in 49
-- places. `commission_percent` is legacy. The line below reads
-- `oi.platform_percent`.
--
-- So: 027's tables, 051's rules (T+3 business-day hold, minimum with rollover),
-- 081's semantics (physical lines only), pre-059 column names, and
-- `fulfilled_at` as the single delivery timestamp.
--
-- ===========================================================================
-- MONEY UNITS: this file is numeric ILS, on purpose
-- ===========================================================================
--
-- The project rule is agorot as integer through src/lib/money.ts. This file
-- writes numeric(12,2) ILS anyway, because it must agree with the columns it
-- reads: `order_items.total_price_ils` and `supplier_payout_ils` are numeric
-- on this database today. A payout line in agorot summed from an ILS numeric
-- would be a unit mismatch on the money path, which is the exact class of
-- defect `PENDING-money-integer-fix.sql` exists to untangle. When that file is
-- eventually approved and run, THIS file's four numeric columns and the
-- function body move with it, in the same change. Splitting the units across
-- two migrations is how a x100 bug is born.
--
-- Idempotent, forward-only, one transaction.

BEGIN;

-- ===========================================================================
-- 0. Guards
-- ===========================================================================
DO $$
BEGIN
  IF to_regproc('public.is_admin') IS NULL
     OR to_regproc('public.is_supplier_member') IS NULL
     OR to_regproc('public.is_supplier_owner') IS NULL
     OR to_regproc('public.set_updated_at') IS NULL THEN
    RAISE EXCEPTION '116 requires is_admin / is_supplier_member / is_supplier_owner / set_updated_at';
  END IF;

  IF to_regtype('public.payout_status') IS NULL
     OR to_regtype('public.payout_line_type') IS NULL THEN
    RAISE EXCEPTION '116 requires the payout_status and payout_line_type enums (027)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'payout_status'
      AND e.enumlabel = 'pending_approval'
  ) THEN
    RAISE EXCEPTION '116 requires payout_status to carry pending_approval (083)';
  END IF;

  -- The pre-059 money columns this file's function body reads. If a future
  -- database has been through 059, this file is the wrong one: use 081.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items'
      AND column_name = 'supplier_payout_ils'
  ) THEN
    RAISE EXCEPTION
      '116 targets the pre-059 money columns (order_items.supplier_payout_ils missing). On a post-059 database apply 081 instead.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items'
      AND column_name = 'delivered_at'
  ) THEN
    RAISE EXCEPTION
      '116 was written for an order_items with no delivered_at column; this database has one, so the delivery timestamp choice below must be re-decided before applying.';
  END IF;
END $$;

-- ===========================================================================
-- 1. T+3 business-day calculator (051 section 1)
-- ===========================================================================
-- Israeli business week: Sunday..Thursday are business days, Friday and
-- Saturday are the weekend. dow: 0=Sun .. 5=Fri, 6=Sat.
--
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

-- ===========================================================================
-- 2. Policy knobs on suppliers (051 section 2)
-- ===========================================================================
-- This is a PAYOUT THRESHOLD and a HOLD, not a commission. The no-defaults rule
-- (AGENTS.md) forbids a default for platform_percent / supplier_split_percent
-- and says nothing about either of these: both are platform policy, not a
-- per-product split, and both are overridable per supplier.
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

-- ===========================================================================
-- 3. Bank details (027 section 7)
-- ===========================================================================
-- `mark_payout_statement_paid` freezes these onto the statement at payment
-- time, so the payout engine cannot be installed without them. Israeli bank
-- coordinates: 2-digit bank, 3-digit branch, 4-9 digit account.
CREATE TABLE IF NOT EXISTS public.supplier_bank_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  account_holder_name text        NOT NULL,
  holder_id_number    text,       -- beneficiary ID (t.z. / company number)
  bank_code           text        NOT NULL CHECK (bank_code   ~ '^[0-9]{2}$'),
  branch_code         text        NOT NULL CHECK (branch_code ~ '^[0-9]{3}$'),
  account_number      text        NOT NULL CHECK (account_number ~ '^[0-9]{4,9}$'),
  is_active           boolean     NOT NULL DEFAULT true,
  verified_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_bank_accounts_active_uq
  ON public.supplier_bank_accounts (supplier_id) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_bank_accounts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.supplier_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Owner-only within the supplier, plus admin. No DELETE policy: deactivate via
-- is_active so payment history keeps its reference.
DROP POLICY IF EXISTS "bank_accounts: owner select" ON public.supplier_bank_accounts;
CREATE POLICY "bank_accounts: owner select"
  ON public.supplier_bank_accounts FOR SELECT TO authenticated
  USING (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "bank_accounts: owner insert" ON public.supplier_bank_accounts;
CREATE POLICY "bank_accounts: owner insert"
  ON public.supplier_bank_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "bank_accounts: owner update" ON public.supplier_bank_accounts;
CREATE POLICY "bank_accounts: owner update"
  ON public.supplier_bank_accounts FOR UPDATE TO authenticated
  USING (public.is_supplier_owner(supplier_id))
  WITH CHECK (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "bank_accounts: admin all" ON public.supplier_bank_accounts;
CREATE POLICY "bank_accounts: admin all"
  ON public.supplier_bank_accounts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 4. Statements and lines (027 section 14, with 051's columns folded in)
-- ===========================================================================
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
  available_at           timestamptz,
  min_payout_ils         numeric(12,2),
  rolled_over            boolean     NOT NULL DEFAULT false,
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

-- Idempotence for a partial run that created 027's shape without 051's columns.
ALTER TABLE public.payout_statements
  ADD COLUMN IF NOT EXISTS available_at   timestamptz,
  ADD COLUMN IF NOT EXISTS min_payout_ils numeric(12,2),
  ADD COLUMN IF NOT EXISTS rolled_over    boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payout_statements.available_at IS
  'Latest T+3 moment across this statement lines: the statement is not payable before it (CONTRADICTIONS C8).';
COMMENT ON COLUMN public.payout_statements.min_payout_ils IS
  'Threshold snapshot in force when this statement was generated. Frozen so later policy changes do not rewrite history.';
COMMENT ON COLUMN public.payout_statements.rolled_over IS
  'true when the run was cancelled because the balance was below the minimum; its lines are free to be picked up by the next run.';

-- One live statement per supplier per period. Cancelled ones do not block,
-- which is what makes rollover work.
CREATE UNIQUE INDEX IF NOT EXISTS payout_statements_period_uq
  ON public.payout_statements (supplier_id, period_start, period_end)
  WHERE status <> 'cancelled'::public.payout_status;

CREATE INDEX IF NOT EXISTS payout_statements_supplier_idx
  ON public.payout_statements (supplier_id, period_start DESC);
CREATE INDEX IF NOT EXISTS payout_statements_status_idx
  ON public.payout_statements (status);
CREATE INDEX IF NOT EXISTS payout_statements_available_idx
  ON public.payout_statements (available_at)
  WHERE available_at IS NOT NULL;

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
  available_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (
    order_item_id IS NOT NULL
    OR coupon_code_id IS NOT NULL
    OR line_type = 'adjustment'::public.payout_line_type
  )
);

ALTER TABLE public.payout_statement_lines
  ADD COLUMN IF NOT EXISTS available_at timestamptz;

COMMENT ON COLUMN public.payout_statement_lines.available_at IS
  'T+3 business days after the line money event (fulfilment). Lines are only collected once this has passed.';

-- `coupon_code_id` stays on the table even though no code path writes it any
-- more: the column is what an `adjustment` line would reference if a voucher
-- ever had to be settled by hand, and dropping it would make the 027 CHECK
-- above unsatisfiable for that case.

CREATE INDEX IF NOT EXISTS payout_statement_lines_statement_idx
  ON public.payout_statement_lines (statement_id);
CREATE INDEX IF NOT EXISTS payout_statement_lines_order_item_idx
  ON public.payout_statement_lines (order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payout_statement_lines_coupon_idx
  ON public.payout_statement_lines (coupon_code_id) WHERE coupon_code_id IS NOT NULL;

ALTER TABLE public.payout_statements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_statement_lines ENABLE ROW LEVEL SECURITY;

-- Members see non-draft statements of their own supplier. A draft is a run in
-- progress and is not shown to the party being paid.
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

-- ===========================================================================
-- 5. generate_payout_statement
-- ===========================================================================
-- 051's contract (T+3 hold, minimum with rollover) on 081's semantics
-- (physical lines only), against pre-059 columns and `fulfilled_at`.
--
-- The platform fee is written as the residual `gross - payout`, never as the
-- percent applied a second time, so a line can never disagree with what
-- settlement actually booked. `platform_percent` on the line is recorded for
-- the reader, not used in the arithmetic.
--
-- PostgREST calls this with three named arguments (p_supplier_id,
-- p_period_start, p_period_end); p_as_of takes its default. Section 6 drops the
-- 3-argument 027 signature so that call can never resolve to a version that
-- skips both rules.
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

  -- ---- physical items fulfilled in the period, past their T+3 hold ---------
  -- Money comes from the order-time snapshot only. There is no second INSERT
  -- for coupons: under the 2026-07-28 model a redeemed voucher moves no money
  -- through us, so there is nothing to owe and nothing to list.
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
    oi.platform_percent,
    oi.total_price_ils - oi.supplier_payout_ils,
    oi.supplier_payout_ils,
    public.add_business_days(oi.fulfilled_at, v_hold_days)
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.supplier_id = p_supplier_id
    AND oi.product_type = 'physical'::public.product_type
    AND oi.item_status = 'delivered'::public.order_item_status
    AND oi.fulfilled_at >= p_period_start
    AND oi.fulfilled_at <  p_period_end + 1
    -- C8: the T+3 chargeback hold must have elapsed
    AND public.add_business_days(oi.fulfilled_at, v_hold_days) <= p_as_of
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
  'Builds a payout statement from order-time snapshots. Physical lines pay the snapshotted supplier_payout_ils; coupons produce no line at all, because the 2026-07-28 model keeps the whole on-site prepayment as platform revenue and the supplier collects the balance at their counter. Collects only lines past their T+3 business-day hold and rolls the run over when the balance is below the supplier minimum (CONTRADICTIONS C8).';

-- ===========================================================================
-- 6. approve / mark paid / cancel
-- ===========================================================================
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

-- Marks paid and freezes the bank details used.
--
-- 027's version also refused to pay a statement with open disputes. That check
-- reads `public.supplier_disputes`, which does not exist on this database and
-- is not referenced anywhere in src/. Static plpgsql SQL against a missing
-- relation raises 42P01 on first execution, so the check cannot simply be
-- carried over. It is kept, guarded by to_regclass and run dynamically: correct
-- today (no table, no disputes, no block) and correct on the day the supplier
-- portal installs the table, with no third version of this function.
CREATE OR REPLACE FUNCTION public.mark_payout_statement_paid(
  p_statement_id      uuid,
  p_payment_reference text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_statement    public.payout_statements%ROWTYPE;
  v_bank         jsonb;
  v_has_disputes boolean := false;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_statement FROM public.payout_statements
  WHERE id = p_statement_id FOR UPDATE;

  IF NOT FOUND OR v_statement.status <> 'approved'::public.payout_status THEN
    RAISE EXCEPTION 'statement not found or not approved';
  END IF;

  IF to_regclass('public.supplier_disputes') IS NOT NULL THEN
    EXECUTE
      'SELECT EXISTS (SELECT 1 FROM public.supplier_disputes
                      WHERE statement_id = $1 AND status::text IN (''open'', ''in_review''))'
      INTO v_has_disputes
      USING p_statement_id;

    IF v_has_disputes THEN
      RAISE EXCEPTION 'statement has open disputes';
    END IF;
  END IF;

  SELECT jsonb_build_object(
           'account_holder_name', account_holder_name,
           'bank_code', bank_code,
           'branch_code', branch_code,
           'account_number', account_number)
  INTO v_bank
  FROM public.supplier_bank_accounts
  WHERE supplier_id = v_statement.supplier_id AND is_active;

  IF v_bank IS NULL THEN
    RAISE EXCEPTION 'supplier has no active bank account';
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

-- The 3-arg 027 signature would still resolve and would bypass both C8 rules.
DROP FUNCTION IF EXISTS public.generate_payout_statement(uuid, date, date);

REVOKE ALL ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payout_statement(uuid, date, date, timestamptz)
  TO authenticated;
REVOKE ALL ON FUNCTION public.approve_payout_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payout_statement(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_payout_statement_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payout_statement_paid(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_payout_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_payout_statement(uuid) TO authenticated;

-- All four are SECURITY DEFINER and all four open with `IF NOT public.is_admin()`.
-- The EXECUTE grant to `authenticated` is what PostgREST needs to route the
-- call at all; the admin check inside is the actual authorisation.

-- ===========================================================================
-- 7. Payment gate: never pay a statement before its T+3 moment (051 section 4)
-- ===========================================================================
-- A second lock on the same rule as generate_payout_statement, one level down.
-- Anything that sets status = 'paid' by any route passes through here.
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

COMMIT;

-- ===========================================================================
-- AFTER APPLYING
-- ===========================================================================
--
-- 1. THE SCREEN WILL WORK AND STILL SHOW NOTHING, AND THAT IS CORRECT.
--    `generate_payout_statement` collects `order_items` that are
--    `product_type = 'physical'` AND `item_status = 'delivered'` AND past T+3.
--    Count those before reading an empty result as a failure:
--
--      SELECT count(*) FROM public.order_items
--      WHERE product_type = 'physical' AND item_status = 'delivered'
--        AND deleted_at IS NULL;
--
--    A run with no eligible lines ends at total 0, which is below any positive
--    minimum, so it cancels itself with rolled_over = true. The admin screen
--    already reads that back and reports the rollover rather than claiming a
--    statement was produced.
--
-- 2. DELETE THE NOT-INSTALLED MESSAGE. `src/server/actions/admin/payouts.ts`
--    lines 42-74 exist only to translate 42883 / 42P01 into a Hebrew
--    explanation that migration 081 was never applied. Once this file is on,
--    that branch is unreachable and the comment above it becomes false. Leaving
--    a stale "this feature is not installed" path in place is how the next
--    reader concludes it still is not.
--
-- 3. Verification, read-only:
--
--      SELECT 'tables' k, count(*)::text v FROM information_schema.tables
--        WHERE table_schema='public' AND table_name LIKE '%payout%'
--      UNION ALL SELECT 'functions', count(*)::text FROM pg_proc p
--        JOIN pg_namespace n ON n.oid=p.pronamespace
--        WHERE n.nspname='public' AND p.proname LIKE '%payout%'
--      UNION ALL SELECT 'suppliers knobs', count(*)::text
--        FROM information_schema.columns
--        WHERE table_schema='public' AND table_name='suppliers'
--          AND column_name IN ('min_payout_ils','payout_hold_business_days');
--
--    Expected: tables = 2, functions = 5 (generate / approve / cancel /
--    mark_paid / payout_available_at), suppliers knobs = 2.
