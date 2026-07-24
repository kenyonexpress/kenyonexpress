-- 055_account_wallet.sql
-- Personal area + internal wallet. See docs/ARCHITECTURE-ACCOUNT-WALLET.md.
--
-- Builds on the APPLIED 046 ledger (wallet_accounts + wallet_entries). It does
-- not create another wallet shape: 001 wallets, 006 wallet_balances /
-- wallet_transactions and the 026 variant are all empty and are marked
-- deprecated here instead.
--
-- Idempotent, forward-only.

-- ===========================================================================
-- 1. Deprecate the dead wallet shapes so no future code picks them up
-- ===========================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='wallet_balances') THEN
    COMMENT ON TABLE public.wallet_balances IS
      'DEPRECATED (052). Superseded by wallet_accounts (046). Empty; do not read or write.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='wallet_transactions') THEN
    COMMENT ON TABLE public.wallet_transactions IS
      'DEPRECATED (052). Superseded by wallet_entries (046). Empty; do not read or write.';
  END IF;
END $$;

COMMENT ON TABLE public.wallet_accounts IS
  'Canonical wallet. One row per user (user_id set) plus platform accounts (code set). balance_ils is a maintained cache; wallet_entries is the source of truth.';
COMMENT ON TABLE public.wallet_entries IS
  'Append-only double-entry ledger. Never UPDATEd or DELETEd; corrections are counter-entries. All writes go through fn_wallet_transfer under the service role.';

-- ===========================================================================
-- 2. cashback_rules
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.cashback_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_he          text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  percent          numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  every_nth_order  integer NULL CHECK (every_nth_order IS NULL OR every_nth_order >= 1),
  min_order_ils    numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_order_ils >= 0),
  max_cashback_ils numeric(12,2) NULL CHECK (max_cashback_ils IS NULL OR max_cashback_ils > 0),
  category_id      uuid NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  starts_at        timestamptz NULL,
  ends_at          timestamptz NULL,
  priority         integer NOT NULL DEFAULT 100,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_rules_window CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at
  )
);

COMMENT ON TABLE public.cashback_rules IS
  'Data-driven cashback. Lowest priority wins and only ONE rule applies per order, so the amount stays explainable to the customer.';
COMMENT ON COLUMN public.cashback_rules.every_nth_order IS
  'NULL = every order. 5 = only when the paid order is the customer''s 5th, 10th, ...';

CREATE INDEX IF NOT EXISTS idx_cashback_rules_active
  ON public.cashback_rules (priority, id) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.cashback_rules;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.cashback_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cashback_rules ENABLE ROW LEVEL SECURITY;

-- Public may read ACTIVE rules only (storefront shows "you will get X back").
DROP POLICY IF EXISTS cashback_rules_public_read ON public.cashback_rules;
CREATE POLICY cashback_rules_public_read ON public.cashback_rules
  FOR SELECT USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >  now())
  );

DROP POLICY IF EXISTS cashback_rules_admin_all ON public.cashback_rules;
CREATE POLICY cashback_rules_admin_all ON public.cashback_rules
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 3. Cashback resolution
-- ===========================================================================

-- Returns the percent that applies to this order, or 0 when no rule matches.
-- Called inside the payment webhook transaction, never from the client.
CREATE OR REPLACE FUNCTION public.fn_wallet_cashback_percent(
  p_user_id         uuid,
  p_order_total_ils numeric,
  p_category_ids    uuid[] DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_paid_orders integer;
  v_percent     numeric;
BEGIN
  IF p_user_id IS NULL OR p_order_total_ils IS NULL OR p_order_total_ils <= 0 THEN
    RETURN 0;
  END IF;

  -- Count orders already paid by this user. The order being finalised is
  -- included by the caller's transaction, so this is the ordinal of THIS order.
  SELECT count(*) INTO v_paid_orders
  FROM public.orders
  WHERE user_id = p_user_id
    AND paid_at IS NOT NULL
    AND deleted_at IS NULL;

  SELECT r.percent INTO v_percent
  FROM public.cashback_rules r
  WHERE r.is_active
    AND (r.starts_at IS NULL OR r.starts_at <= now())
    AND (r.ends_at   IS NULL OR r.ends_at   >  now())
    AND p_order_total_ils >= r.min_order_ils
    AND (r.every_nth_order IS NULL OR (v_paid_orders > 0 AND v_paid_orders % r.every_nth_order = 0))
    AND (r.category_id IS NULL OR (p_category_ids IS NOT NULL AND r.category_id = ANY (p_category_ids)))
  ORDER BY r.priority, r.id
  LIMIT 1;

  RETURN COALESCE(v_percent, 0);
END $$;

COMMENT ON FUNCTION public.fn_wallet_cashback_percent(uuid, numeric, uuid[]) IS
  'Resolves the single applicable cashback rule for an order. Returns 0 when none matches.';

-- Amount, with the per-rule ceiling applied. Kept separate so the percent can
-- be shown in the UI without recomputing the cap.
CREATE OR REPLACE FUNCTION public.fn_wallet_cashback_amount(
  p_user_id         uuid,
  p_order_total_ils numeric,
  p_category_ids    uuid[] DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_paid_orders integer;
  v_percent     numeric;
  v_cap         numeric;
  v_amount      numeric;
BEGIN
  IF p_user_id IS NULL OR p_order_total_ils IS NULL OR p_order_total_ils <= 0 THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_paid_orders
  FROM public.orders
  WHERE user_id = p_user_id
    AND paid_at IS NOT NULL
    AND deleted_at IS NULL;

  -- Resolve percent AND cap from the SAME row. Reading the cap in a second
  -- query keyed on the percent would pick the wrong rule whenever two rules
  -- share a percent.
  SELECT r.percent, r.max_cashback_ils INTO v_percent, v_cap
  FROM public.cashback_rules r
  WHERE r.is_active
    AND (r.starts_at IS NULL OR r.starts_at <= now())
    AND (r.ends_at   IS NULL OR r.ends_at   >  now())
    AND p_order_total_ils >= r.min_order_ils
    AND (r.every_nth_order IS NULL OR (v_paid_orders > 0 AND v_paid_orders % r.every_nth_order = 0))
    AND (r.category_id IS NULL OR (p_category_ids IS NOT NULL AND r.category_id = ANY (p_category_ids)))
  ORDER BY r.priority, r.id
  LIMIT 1;

  IF v_percent IS NULL THEN
    RETURN 0;
  END IF;

  v_amount := round(p_order_total_ils * v_percent / 100.0, 2);
  IF v_cap IS NOT NULL AND v_amount > v_cap THEN
    v_amount := v_cap;
  END IF;

  RETURN v_amount;
END $$;

COMMENT ON FUNCTION public.fn_wallet_cashback_amount(uuid, numeric, uuid[]) IS
  'Cashback in ILS for an order, with the matching rule''s ceiling applied. Returns 0 when no rule matches.';

-- ===========================================================================
-- 4. User-facing ledger view
-- ===========================================================================

-- security_invoker so the caller's RLS applies. Without it the view would be a
-- hole straight through wallet_entries.
CREATE OR REPLACE VIEW public.v_wallet_ledger
WITH (security_invoker = true) AS
SELECT
  e.id,
  a.user_id,
  CASE WHEN e.credit_account = a.id THEN 'credit' ELSE 'debit' END AS direction,
  CASE WHEN e.credit_account = a.id THEN e.amount_ils ELSE -e.amount_ils END AS signed_amount_ils,
  e.amount_ils,
  e.reason,
  e.order_id,
  e.created_at
FROM public.wallet_entries e
JOIN public.wallet_accounts a
  ON a.id IN (e.debit_account, e.credit_account)
WHERE a.user_id IS NOT NULL;

COMMENT ON VIEW public.v_wallet_ledger IS
  'Per-user wallet ledger with signed amounts. security_invoker: the reader''s RLS on wallet_entries decides visibility.';

-- Admin reconciliation: cached balance vs the ledger. Should always be empty.
CREATE OR REPLACE VIEW public.v_wallet_balance_drift AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.code,
  a.balance_ils AS cached_balance_ils,
  COALESCE(SUM(
    CASE WHEN e.credit_account = a.id THEN e.amount_ils
         WHEN e.debit_account  = a.id THEN -e.amount_ils END
  ), 0) AS ledger_balance_ils,
  a.balance_ils - COALESCE(SUM(
    CASE WHEN e.credit_account = a.id THEN e.amount_ils
         WHEN e.debit_account  = a.id THEN -e.amount_ils END
  ), 0) AS drift_ils
FROM public.wallet_accounts a
LEFT JOIN public.wallet_entries e
  ON a.id IN (e.debit_account, e.credit_account)
GROUP BY a.id, a.user_id, a.code, a.balance_ils
HAVING a.balance_ils <> COALESCE(SUM(
  CASE WHEN e.credit_account = a.id THEN e.amount_ils
       WHEN e.debit_account  = a.id THEN -e.amount_ils END
), 0);

COMMENT ON VIEW public.v_wallet_balance_drift IS
  'Rows here mean the cached wallet_accounts.balance_ils diverged from the ledger. Expected to be empty.';

-- ===========================================================================
-- 5. RLS gaps this domain needs
-- ===========================================================================

-- A user could not see their own ledger at all: 046 only granted admin SELECT.
DROP POLICY IF EXISTS wallet_entries_owner_read ON public.wallet_entries;
CREATE POLICY wallet_entries_owner_read ON public.wallet_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.wallet_accounts a
      WHERE a.id IN (wallet_entries.debit_account, wallet_entries.credit_account)
        AND a.user_id = auth.uid()
    )
  );

-- Saved cards were read-only, so /account/tokens had no way to remove one.
DROP POLICY IF EXISTS payment_tokens_owner_delete ON public.payment_tokens;
CREATE POLICY payment_tokens_owner_delete ON public.payment_tokens
  FOR DELETE TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS payment_tokens_owner_update ON public.payment_tokens;
CREATE POLICY payment_tokens_owner_update ON public.payment_tokens
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- Deliberately absent: any INSERT/UPDATE/DELETE policy on wallet_entries or
-- wallet_accounts. Money moves only through fn_wallet_transfer (service role),
-- which is what makes the ledger append-only in fact and not just by convention.

-- ===========================================================================
-- 6. Wallet account provisioning
-- ===========================================================================

-- Every profile needs an account before it can be credited. Backfill + trigger.
INSERT INTO public.wallet_accounts (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.wallet_accounts a ON a.user_id = p.id
WHERE a.id IS NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_ensure_wallet_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.wallet_accounts (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ensure_wallet_account ON public.profiles;
CREATE TRIGGER ensure_wallet_account
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_wallet_account();

-- ===========================================================================
-- 7. Launch cashback configuration
-- ===========================================================================

-- The 5%-every-5th-purchase rule that used to be hard-coded in the skill doc.
INSERT INTO public.cashback_rules (name_he, percent, every_nth_order, priority)
SELECT 'קאשבק 5% בכל רכישה חמישית', 5, 5, 100
WHERE NOT EXISTS (SELECT 1 FROM public.cashback_rules);
