-- ============================================================================
-- 055_ledger_core.sql  (spec number 033; renumbered 033->050 because 033-035
-- already exist in this tree and 049 was the last used number; full mapping
-- 033->050 ... 039->056, see LEDGER-DESIGN.md section 0)
--
-- Double-entry ledger core: ledger_accounts, ledger_journals,
-- ledger_journal_lines. Sum-zero per journal enforced by a DEFERRABLE
-- constraint trigger (a CHECK constraint cannot aggregate across rows).
-- Journals and lines are append-only: UPDATE/DELETE/TRUNCATE blocked by
-- triggers (effective even for service_role); corrections are reversal
-- journals only. Amounts are signed bigint agorot: positive = debit,
-- negative = credit. RLS is enabled here with no policies (default deny);
-- read policies land in 061_money_rls.sql.
--
-- ROLLBACK NOTE: this migration only creates new objects. To roll back:
--   DROP TABLE IF EXISTS public.ledger_journal_lines;
--   DROP TABLE IF EXISTS public.ledger_journals;
--   DROP TABLE IF EXISTS public.ledger_accounts;
--   DROP FUNCTION IF EXISTS public.fn_ledger_check_journal_balance();
--   DROP FUNCTION IF EXISTS public.fn_ledger_block_mutation();
--   DROP FUNCTION IF EXISTS public.fn_ensure_ledger_account(public.ledger_account_kind, uuid, uuid);
--   DROP TYPE IF EXISTS public.ledger_event;
--   DROP TYPE IF EXISTS public.ledger_account_kind;
--   DROP TYPE IF EXISTS public.ledger_side;
-- Safe only while no other object references the ledger (056 policies,
-- 054 settlement_batches.ledger_journal_id).
-- ============================================================================

-- Defensive: 001 may stop early on live DBs.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Enums -------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.ledger_account_kind AS ENUM (
    'platform_revenue',
    'supplier_payable',
    'customer_wallet',
    'cardcom_clearing',
    'vat_output'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.ledger_side AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.ledger_event AS ENUM (
    'order_paid',
    'coupon_issued',
    'coupon_redeemed',
    'coupon_expired',
    'physical_settled',
    'refund',
    'chargeback',
    'wallet_cashback_earned',
    'wallet_spent',
    'wallet_expired',
    'manual_adjustment',
    'reversal'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. ledger_accounts ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  kind        public.ledger_account_kind NOT NULL,
  normal_side public.ledger_side NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  currency    text NOT NULL DEFAULT 'ILS' CHECK (currency = 'ILS'),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Ownership must match the account kind.
  CONSTRAINT ledger_accounts_owner_by_kind CHECK (
    (kind IN ('platform_revenue'::public.ledger_account_kind,
              'cardcom_clearing'::public.ledger_account_kind,
              'vat_output'::public.ledger_account_kind)
       AND supplier_id IS NULL AND user_id IS NULL)
    OR (kind = 'supplier_payable'::public.ledger_account_kind
       AND supplier_id IS NOT NULL AND user_id IS NULL)
    OR (kind = 'customer_wallet'::public.ledger_account_kind
       AND user_id IS NOT NULL AND supplier_id IS NULL)
  )
);

-- Exactly one global account per kind, one payable per supplier, one wallet
-- per user.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_global_kind_key
  ON public.ledger_accounts (kind)
  WHERE supplier_id IS NULL AND user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_supplier_kind_key
  ON public.ledger_accounts (kind, supplier_id)
  WHERE supplier_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_user_kind_key
  ON public.ledger_accounts (kind, user_id)
  WHERE user_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.ledger_accounts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the three global singleton accounts.
INSERT INTO public.ledger_accounts (code, kind, normal_side)
VALUES
  ('platform_revenue', 'platform_revenue'::public.ledger_account_kind, 'credit'::public.ledger_side),
  ('cardcom_clearing', 'cardcom_clearing'::public.ledger_account_kind, 'debit'::public.ledger_side),
  ('vat_output',       'vat_output'::public.ledger_account_kind,       'credit'::public.ledger_side)
ON CONFLICT (code) DO NOTHING;

-- Lazy get-or-create for per-supplier / per-user accounts. Service-role only
-- (grants at the bottom). Race-safe via ON CONFLICT on the account code.
CREATE OR REPLACE FUNCTION public.fn_ensure_ledger_account(
  p_kind public.ledger_account_kind,
  p_supplier_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_code text;
  v_id uuid;
BEGIN
  IF p_kind = 'supplier_payable'::public.ledger_account_kind THEN
    IF p_supplier_id IS NULL THEN
      RAISE EXCEPTION 'supplier_payable account requires supplier_id';
    END IF;
    v_code := 'supplier_payable:' || p_supplier_id::text;
    INSERT INTO public.ledger_accounts (code, kind, normal_side, supplier_id)
    VALUES (v_code, p_kind, 'credit'::public.ledger_side, p_supplier_id)
    ON CONFLICT (code) DO NOTHING;
  ELSIF p_kind = 'customer_wallet'::public.ledger_account_kind THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'customer_wallet account requires user_id';
    END IF;
    v_code := 'customer_wallet:' || p_user_id::text;
    INSERT INTO public.ledger_accounts (code, kind, normal_side, user_id)
    VALUES (v_code, p_kind, 'credit'::public.ledger_side, p_user_id)
    ON CONFLICT (code) DO NOTHING;
  ELSE
    v_code := p_kind::text;
  END IF;

  SELECT id INTO v_id FROM public.ledger_accounts WHERE code = v_code;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'ledger account % not found and could not be created', v_code;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ensure_ledger_account(public.ledger_account_kind, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ensure_ledger_account(public.ledger_account_kind, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_ensure_ledger_account(public.ledger_account_kind, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_ledger_account(public.ledger_account_kind, uuid, uuid) TO service_role;

-- 3. ledger_journals ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ledger_journals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type          public.ledger_event NOT NULL,
  -- Idempotency key of the business event (see posting rules table in
  -- LEDGER-DESIGN.md). Posting the same event twice is a unique violation.
  event_key           text NOT NULL UNIQUE,
  order_id            uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id       uuid REFERENCES public.order_items(id) ON DELETE RESTRICT,
  payment_id          uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  coupon_code_id      uuid REFERENCES public.coupon_codes(id) ON DELETE RESTRICT,
  -- Corrections: a reversal journal points at the journal it reverses.
  -- UNIQUE: at most one reversal per journal (reverse the reversal to re-post).
  reverses_journal_id uuid UNIQUE REFERENCES public.ledger_journals(id) ON DELETE RESTRICT,
  vat_rate_bp         integer NOT NULL DEFAULT 1700 CHECK (vat_rate_bp >= 0 AND vat_rate_bp <= 10000),
  memo                text,
  created_by          uuid,
  posted_at           timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_journals_reversal_target CHECK (
    (event_type = 'reversal'::public.ledger_event) = (reverses_journal_id IS NOT NULL)
  )
);
-- No updated_at on purpose: journals are immutable, there is nothing to update.

CREATE INDEX IF NOT EXISTS idx_ledger_journals_event_type ON public.ledger_journals (event_type, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_journals_order ON public.ledger_journals (order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_journals_order_item ON public.ledger_journals (order_item_id);
CREATE INDEX IF NOT EXISTS idx_ledger_journals_payment ON public.ledger_journals (payment_id);
CREATE INDEX IF NOT EXISTS idx_ledger_journals_coupon ON public.ledger_journals (coupon_code_id);

-- 4. ledger_journal_lines ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ledger_journal_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id    uuid NOT NULL REFERENCES public.ledger_journals(id) ON DELETE RESTRICT,
  line_no       smallint NOT NULL CHECK (line_no > 0),
  account_id    uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  -- Signed agorot: positive = debit, negative = credit. Never zero.
  amount_agorot bigint NOT NULL CHECK (amount_agorot <> 0),
  memo          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_journal_lines_journal_line_key UNIQUE (journal_id, line_no)
);
-- No updated_at on purpose: lines are immutable.

CREATE INDEX IF NOT EXISTS idx_ledger_journal_lines_journal ON public.ledger_journal_lines (journal_id);
CREATE INDEX IF NOT EXISTS idx_ledger_journal_lines_account ON public.ledger_journal_lines (account_id, created_at DESC);

-- 5. Sum-zero enforcement ----------------------------------------------------
-- Why a trigger and not a CHECK: a CHECK constraint is evaluated against a
-- single row and cannot aggregate across the other lines of the journal
-- (subqueries are not allowed in CHECK expressions). A DEFERRABLE INITIALLY
-- DEFERRED constraint trigger runs at COMMIT, after all lines of the journal
-- were inserted in the same transaction, so multi-line inserts balance out
-- and any transaction that leaves a journal unbalanced fails atomically.

CREATE OR REPLACE FUNCTION public.fn_ledger_check_journal_balance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_journal_id uuid;
  v_sum bigint;
BEGIN
  v_journal_id := COALESCE(NEW.journal_id, OLD.journal_id);
  SELECT COALESCE(sum(amount_agorot), 0) INTO v_sum
  FROM public.ledger_journal_lines
  WHERE journal_id = v_journal_id;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'ledger journal % is not balanced: sum(amount_agorot) = %',
      v_journal_id, v_sum;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_lines_balanced ON public.ledger_journal_lines;
CREATE CONSTRAINT TRIGGER trg_ledger_lines_balanced
  AFTER INSERT OR UPDATE OR DELETE ON public.ledger_journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_ledger_check_journal_balance();

-- 6. Immutability ------------------------------------------------------------
-- Posted journals and lines can never be updated or deleted; corrections go
-- through reversal journals only. Triggers are the primary enforcement layer
-- because they also bind service_role (which bypasses RLS). RLS (056) adds
-- the second layer: no client role gets any write policy.

CREATE OR REPLACE FUNCTION public.fn_ledger_block_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: % on % is forbidden; post a reversal journal instead',
    TG_OP, TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_journals_immutable ON public.ledger_journals;
CREATE TRIGGER trg_ledger_journals_immutable
  BEFORE UPDATE OR DELETE ON public.ledger_journals
  FOR EACH ROW EXECUTE FUNCTION public.fn_ledger_block_mutation();

DROP TRIGGER IF EXISTS trg_ledger_journals_no_truncate ON public.ledger_journals;
CREATE TRIGGER trg_ledger_journals_no_truncate
  BEFORE TRUNCATE ON public.ledger_journals
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_ledger_block_mutation();

DROP TRIGGER IF EXISTS trg_ledger_journal_lines_immutable ON public.ledger_journal_lines;
CREATE TRIGGER trg_ledger_journal_lines_immutable
  BEFORE UPDATE OR DELETE ON public.ledger_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_ledger_block_mutation();

DROP TRIGGER IF EXISTS trg_ledger_journal_lines_no_truncate ON public.ledger_journal_lines;
CREATE TRIGGER trg_ledger_journal_lines_no_truncate
  BEFORE TRUNCATE ON public.ledger_journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_ledger_block_mutation();

-- 7. Balances view (reporting convenience; signed sum per account) -----------

CREATE OR REPLACE VIEW public.v_ledger_account_balances AS
SELECT
  a.id AS account_id,
  a.code,
  a.kind,
  a.normal_side,
  a.supplier_id,
  a.user_id,
  COALESCE(sum(l.amount_agorot), 0)::bigint AS signed_balance_agorot,
  CASE WHEN a.normal_side = 'credit'::public.ledger_side
       THEN -COALESCE(sum(l.amount_agorot), 0)
       ELSE COALESCE(sum(l.amount_agorot), 0)
  END::bigint AS natural_balance_agorot
FROM public.ledger_accounts a
LEFT JOIN public.ledger_journal_lines l ON l.account_id = a.id
GROUP BY a.id, a.code, a.kind, a.normal_side, a.supplier_id, a.user_id;

-- 8. RLS: enabled now, default deny; policies land in 056 --------------------

ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_journal_lines ENABLE ROW LEVEL SECURITY;
