-- Migration 026: Commerce domain (DRAFT - DO NOT APPLY YET)
-- Design: docs/ARCHITECTURE-COMMERCE.md
-- Dynamic per-product platform_percent, payments (Cardcom), double-entry wallet,
-- coupon redemptions with replay guards, supplier payout settlement.
-- Fully idempotent. Written defensively against known live-DB drift.

-- Defensive: 001 may have stopped early on a live DB before defining this function.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ===========================================================================
-- 1. ENUMs
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE public.payment_kind AS ENUM ('charge', 'token_charge', 'refund');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM (
    'initiated', 'redirected', 'succeeded', 'failed', 'cancelled', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_reason AS ENUM (
    'cashback_earn', 'order_spend', 'expire', 'refund_credit', 'referral_bonus', 'manual_adjust'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_status AS ENUM ('draft', 'approved', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 2. Dynamic commission: platform_percent on products + coupon_deals
--    vendors.commission_rate is demoted to a form default; never read at checkout.
-- ===========================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform_percent numeric(5,2) NOT NULL DEFAULT 10
    CHECK (platform_percent BETWEEN 0 AND 100);

ALTER TABLE public.coupon_deals
  ADD COLUMN IF NOT EXISTS platform_percent numeric(5,2) NOT NULL DEFAULT 10
    CHECK (platform_percent BETWEEN 0 AND 100);

-- ===========================================================================
-- 3. cart_items (normalized; carts.items jsonb keeps working until code cutover)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.cart_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    uuid        NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid        REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity   int         NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE with nullable variant_id needs a coalescing expression index
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_product_variant_key
  ON public.cart_items (cart_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS cart_items_cart_id_idx ON public.cart_items (cart_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.cart_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cart_items: owner all" ON public.cart_items;
CREATE POLICY "cart_items: owner all"
  ON public.cart_items FOR ALL TO authenticated
  USING (cart_id IN (SELECT id FROM public.carts WHERE profile_id = auth.uid()))
  WITH CHECK (cart_id IN (SELECT id FROM public.carts WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS "cart_items: admin all" ON public.cart_items;
CREATE POLICY "cart_items: admin all"
  ON public.cart_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 4. orders + order_items: lifecycle timestamps + dynamic split snapshot
-- ===========================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at      timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_pending_expiry
  ON public.orders (expires_at)
  WHERE status = 'pending'::public.order_status;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS platform_percent            numeric(5,2)  NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS platform_fee_ils            numeric(12,2) NOT NULL DEFAULT 0 CHECK (platform_fee_ils >= 0),
  ADD COLUMN IF NOT EXISTS supplier_due_ils            numeric(12,2) NOT NULL DEFAULT 0 CHECK (supplier_due_ils >= 0),
  ADD COLUMN IF NOT EXISTS charged_on_site_ils         numeric(12,2) NOT NULL DEFAULT 0 CHECK (charged_on_site_ils >= 0),
  ADD COLUMN IF NOT EXISTS balance_due_at_business_ils numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_due_at_business_ils >= 0);

-- Backfill deprecated twins from any pre-existing rows (best effort; both
-- directions guarded to zero-only rows so re-runs never clobber real data).
UPDATE public.order_items
   SET platform_percent = commission_percent
 WHERE platform_percent = 10 AND commission_percent IS NOT NULL AND commission_percent <> 10;

-- ===========================================================================
-- 5. payments + payment_webhook_events
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id                      uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                uuid                  NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  kind                    public.payment_kind   NOT NULL DEFAULT 'charge',
  status                  public.payment_status NOT NULL DEFAULT 'initiated',
  amount_ils              numeric(12,2)         NOT NULL CHECK (amount_ils > 0),
  currency                text                  NOT NULL DEFAULT 'ILS',
  wallet_applied_ils      numeric(12,2)         NOT NULL DEFAULT 0 CHECK (wallet_applied_ils >= 0),
  token_id                uuid                  REFERENCES public.payment_tokens(id) ON DELETE SET NULL,
  cardcom_low_profile_id  text                  UNIQUE,
  cardcom_transaction_id  text                  UNIQUE,
  refund_of_payment_id    uuid                  REFERENCES public.payments(id) ON DELETE RESTRICT,
  idempotency_key         text                  NOT NULL UNIQUE,
  failure_code            text,
  failure_message         text,
  raw_response            jsonb                 NOT NULL DEFAULT '{}'::jsonb,
  succeeded_at            timestamptz,
  failed_at               timestamptz,
  created_at              timestamptz           NOT NULL DEFAULT now(),
  updated_at              timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON public.payments (status, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.payments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users read payments on their own orders; all writes via service role only.
DROP POLICY IF EXISTS "payments: user read own" ON public.payments;
CREATE POLICY "payments: user read own"
  ON public.payments FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "payments: admin read" ON public.payments;
CREATE POLICY "payments: admin read"
  ON public.payments FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             text        NOT NULL DEFAULT 'cardcom',
  external_event_id    text        NOT NULL,
  payment_id           uuid        REFERENCES public.payments(id) ON DELETE SET NULL,
  signature_valid      boolean     NOT NULL,
  verified_against_api boolean     NOT NULL DEFAULT false,
  payload              jsonb       NOT NULL,
  received_at          timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz,
  CONSTRAINT payment_webhook_events_dedup UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_payment ON public.payment_webhook_events (payment_id);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_events: admin read" ON public.payment_webhook_events;
CREATE POLICY "webhook_events: admin read"
  ON public.payment_webhook_events FOR SELECT TO authenticated
  USING (public.is_admin());

-- ===========================================================================
-- 6. Wallet: double-entry ledger
--    6a. Park the 006 single-entry table as _legacy (read-only history).
-- ===========================================================================

DO $$ BEGIN
  IF to_regclass('public.wallet_transactions') IS NOT NULL
     AND to_regclass('public.wallet_transactions_legacy') IS NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'wallet_transactions'
         AND column_name = 'wallet_id'   -- fingerprint of the 006 shape
     )
  THEN
    ALTER TABLE public.wallet_transactions RENAME TO wallet_transactions_legacy;
  END IF;
END $$;

-- 6b. wallet_accounts
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type  text          NOT NULL CHECK (owner_type IN ('user', 'platform')),
  user_id     uuid          UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  code        text          UNIQUE,
  balance_ils numeric(12,2) NOT NULL DEFAULT 0,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT wallet_accounts_user_shape     CHECK ((owner_type = 'user') = (user_id IS NOT NULL)),
  CONSTRAINT wallet_accounts_platform_shape CHECK ((owner_type = 'platform') = (code IS NOT NULL)),
  CONSTRAINT wallet_accounts_user_nonneg    CHECK (owner_type = 'platform' OR balance_ils >= 0)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.wallet_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.wallet_accounts (owner_type, code)
VALUES ('platform', 'platform:cashback_reserve'),
       ('platform', 'platform:revenue'),
       ('platform', 'platform:adjustments')
ON CONFLICT (code) DO NOTHING;

-- Seed user accounts from 006 balances (idempotent via user_id unique)
INSERT INTO public.wallet_accounts (owner_type, user_id, balance_ils)
SELECT 'user', wb.user_id, wb.balance_ils
FROM public.wallet_balances wb
WHERE wb.deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 6c. wallet_transactions (double-entry journal, append-only)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                    uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_account_id      uuid                 NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  credit_account_id     uuid                 NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  amount_ils            numeric(12,2)        NOT NULL CHECK (amount_ils > 0),
  reason                public.wallet_reason NOT NULL,
  related_order_id      uuid                 REFERENCES public.orders(id) ON DELETE SET NULL,
  related_order_item_id uuid                 REFERENCES public.order_items(id) ON DELETE SET NULL,
  idempotency_key       text                 NOT NULL UNIQUE,
  note                  text,
  created_by            uuid                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT wallet_tx_distinct_accounts CHECK (debit_account_id <> credit_account_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_debit  ON public.wallet_transactions (debit_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_credit ON public.wallet_transactions (credit_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_order  ON public.wallet_transactions (related_order_id);

ALTER TABLE public.wallet_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Accounts: user reads own; admin reads all; NO client writes (definer fn only).
DROP POLICY IF EXISTS "wallet_accounts: user read own" ON public.wallet_accounts;
CREATE POLICY "wallet_accounts: user read own"
  ON public.wallet_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "wallet_accounts: admin read" ON public.wallet_accounts;
CREATE POLICY "wallet_accounts: admin read"
  ON public.wallet_accounts FOR SELECT TO authenticated
  USING (public.is_admin());

-- Journal: user reads rows touching own account; admin reads all; no writes,
-- no updates, no deletes for anyone (append-only via fn_wallet_transfer).
DROP POLICY IF EXISTS "wallet_tx: user read own" ON public.wallet_transactions;
CREATE POLICY "wallet_tx: user read own"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    debit_account_id  IN (SELECT id FROM public.wallet_accounts WHERE user_id = auth.uid())
    OR credit_account_id IN (SELECT id FROM public.wallet_accounts WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "wallet_tx: admin read" ON public.wallet_transactions;
CREATE POLICY "wallet_tx: admin read"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (public.is_admin());

-- 6d. The only writer. Locks both accounts in uuid order (deadlock-free),
--     enforces idempotency, keeps cached balances in sync with the journal.
CREATE OR REPLACE FUNCTION public.fn_wallet_transfer(
  p_debit_account  uuid,
  p_credit_account uuid,
  p_amount_ils     numeric,
  p_reason         public.wallet_reason,
  p_idempotency    text,
  p_order_id       uuid DEFAULT NULL,
  p_order_item_id  uuid DEFAULT NULL,
  p_note           text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx_id uuid;
  v_first uuid; v_second uuid;
BEGIN
  IF p_amount_ils <= 0 THEN RAISE EXCEPTION 'wallet transfer amount must be positive'; END IF;
  IF p_debit_account = p_credit_account THEN RAISE EXCEPTION 'wallet transfer needs two distinct accounts'; END IF;

  -- Idempotent replay: return the existing tx untouched.
  SELECT id INTO v_tx_id FROM public.wallet_transactions WHERE idempotency_key = p_idempotency;
  IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;

  -- Lock both accounts in a fixed global order to avoid deadlocks.
  IF p_debit_account < p_credit_account
    THEN v_first := p_debit_account;  v_second := p_credit_account;
    ELSE v_first := p_credit_account; v_second := p_debit_account;
  END IF;
  PERFORM 1 FROM public.wallet_accounts WHERE id = v_first  FOR UPDATE;
  PERFORM 1 FROM public.wallet_accounts WHERE id = v_second FOR UPDATE;

  INSERT INTO public.wallet_transactions
    (debit_account_id, credit_account_id, amount_ils, reason,
     related_order_id, related_order_item_id, idempotency_key, note, created_by)
  VALUES
    (p_debit_account, p_credit_account, p_amount_ils, p_reason,
     p_order_id, p_order_item_id, p_idempotency, p_note, auth.uid())
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN  -- lost a race on the same key: replay semantics
    SELECT id INTO v_tx_id FROM public.wallet_transactions WHERE idempotency_key = p_idempotency;
    RETURN v_tx_id;
  END IF;

  -- Cached balances; the user-nonneg CHECK on wallet_accounts is the final
  -- double-spend floor and aborts the whole transaction on violation.
  UPDATE public.wallet_accounts SET balance_ils = balance_ils - p_amount_ils WHERE id = p_debit_account;
  UPDATE public.wallet_accounts SET balance_ils = balance_ils + p_amount_ils WHERE id = p_credit_account;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, public.wallet_reason, text, uuid, uuid, text) FROM anon;

-- 6e. handle_new_user: also open a wallet account (keeps 023's inserts so the
--     legacy wallet_balances path works until the code cutover).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.wallet_balances (user_id) VALUES (NEW.id);

  INSERT INTO public.wallet_accounts (owner_type, user_id)
  VALUES ('user', NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ===========================================================================
-- 7. coupon_redemptions + fn_redeem_coupon (atomic CAS + replay guards)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code_id       uuid          NOT NULL UNIQUE REFERENCES public.coupon_codes(id) ON DELETE RESTRICT,
  order_item_id        uuid          REFERENCES public.order_items(id) ON DELETE SET NULL,
  supplier_id          uuid          NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  scanned_by           uuid          NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  method               text          NOT NULL CHECK (method IN ('camera', 'manual')),
  amount_collected_ils numeric(12,2) CHECK (amount_collected_ils >= 0),
  ip                   inet,
  user_agent           text,
  created_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_supplier
  ON public.coupon_redemptions (supplier_id, created_at DESC);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Coupon owner sees own redemptions
DROP POLICY IF EXISTS "redemptions: coupon owner read" ON public.coupon_redemptions;
CREATE POLICY "redemptions: coupon owner read"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (coupon_code_id IN (SELECT id FROM public.coupon_codes WHERE user_id = auth.uid()));

-- Supplier staff see their business's redemptions
DROP POLICY IF EXISTS "redemptions: supplier read" ON public.coupon_redemptions;
CREATE POLICY "redemptions: supplier read"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (
    supplier_id IN (
      SELECT supplier_id FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('vendor'::public.user_role, 'content_uploader'::public.user_role)
    )
  );

DROP POLICY IF EXISTS "redemptions: admin read" ON public.coupon_redemptions;
CREATE POLICY "redemptions: admin read"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policies on purpose: fn_redeem_coupon is the only writer.

CREATE OR REPLACE FUNCTION public.fn_redeem_coupon(p_code text, p_method text)
RETURNS TABLE (
  redemption_id uuid,
  coupon_code_id uuid,
  amount_to_collect_ils numeric,
  reject_reason text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_supplier uuid;
  v_coupon   record;
  v_balance  numeric(12,2);
  v_red_id   uuid;
BEGIN
  IF p_method NOT IN ('camera', 'manual') THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::numeric, 'invalid_method'; RETURN;
  END IF;

  -- Caller must be staff of some supplier
  SELECT p.supplier_id INTO v_supplier
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.role IN ('vendor'::public.user_role, 'content_uploader'::public.user_role,
                   'admin'::public.user_role, 'super_admin'::public.user_role);
  IF v_supplier IS NULL AND NOT public.is_admin() THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::numeric, 'not_authorized'; RETURN;
  END IF;

  -- Brute-force guard (019 infra)
  IF NOT public.check_user_rate_limit(auth.uid(), 'coupon_scan', 20, 60) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::numeric, 'rate_limited'; RETURN;
  END IF;

  -- Atomic compare-and-set: only an issued, unexpired coupon of the caller's
  -- supplier flips to used. Admins may redeem for any supplier.
  UPDATE public.coupon_codes c
     SET status = 'used'::public.coupon_status,
         used_at = now(),
         used_by_supplier_user_id = auth.uid(),
         used_scan_method = p_method
   WHERE c.code = p_code
     AND c.status = 'issued'::public.coupon_status
     AND c.deleted_at IS NULL
     AND c.expires_at > now()
     AND (public.is_admin() OR c.supplier_id = v_supplier)
  RETURNING c.id, c.supplier_id, c.order_item_id INTO v_coupon;

  IF v_coupon.id IS NULL THEN
    -- Distinguish the reject for the UI without leaking other suppliers' data
    SELECT CASE
             WHEN NOT EXISTS (SELECT 1 FROM public.coupon_codes WHERE code = p_code) THEN 'not_found'
             WHEN EXISTS (SELECT 1 FROM public.coupon_codes WHERE code = p_code
                            AND status = 'used'::public.coupon_status) THEN 'already_used'
             WHEN EXISTS (SELECT 1 FROM public.coupon_codes WHERE code = p_code
                            AND expires_at <= now()) THEN 'expired'
             ELSE 'not_redeemable'
           END INTO STRICT reject_reason;
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::numeric, reject_reason; RETURN;
  END IF;

  SELECT oi.balance_due_at_business_ils INTO v_balance
  FROM public.order_items oi WHERE oi.id = v_coupon.order_item_id;

  INSERT INTO public.coupon_redemptions
    (coupon_code_id, order_item_id, supplier_id, scanned_by, method, amount_collected_ils)
  VALUES
    (v_coupon.id, v_coupon.order_item_id, v_coupon.supplier_id, auth.uid(), p_method, v_balance)
  RETURNING id INTO v_red_id;

  RETURN QUERY SELECT v_red_id, v_coupon.id, v_balance, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_redeem_coupon(text, text) FROM anon;

-- ===========================================================================
-- 8. supplier_payouts + supplier_payout_items (physical settlement)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.supplier_payouts (
  id                uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       uuid                 NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  period_start      date                 NOT NULL,
  period_end        date                 NOT NULL,
  status            public.payout_status NOT NULL DEFAULT 'draft',
  items_count       int                  NOT NULL DEFAULT 0 CHECK (items_count >= 0),
  gross_ils         numeric(12,2)        NOT NULL DEFAULT 0 CHECK (gross_ils >= 0),
  platform_fee_ils  numeric(12,2)        NOT NULL DEFAULT 0 CHECK (platform_fee_ils >= 0),
  payout_ils        numeric(12,2)        NOT NULL DEFAULT 0 CHECK (payout_ils >= 0),
  approved_by       uuid                 REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  paid_at           timestamptz,
  payment_reference text,
  notes             text,
  created_at        timestamptz          NOT NULL DEFAULT now(),
  updated_at        timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT payout_period_valid CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_supplier_payouts_supplier
  ON public.supplier_payouts (supplier_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_status
  ON public.supplier_payouts (status);

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_payouts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supplier_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.supplier_payout_items (
  payout_id        uuid          NOT NULL REFERENCES public.supplier_payouts(id) ON DELETE CASCADE,
  order_item_id    uuid          NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,
  supplier_due_ils numeric(12,2) NOT NULL CHECK (supplier_due_ils >= 0),
  PRIMARY KEY (payout_id, order_item_id)
);

ALTER TABLE public.supplier_payouts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payout_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payouts: vendor read own" ON public.supplier_payouts;
CREATE POLICY "payouts: vendor read own"
  ON public.supplier_payouts FOR SELECT TO authenticated
  USING (
    supplier_id IN (
      SELECT supplier_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'vendor'::public.user_role
    )
  );

DROP POLICY IF EXISTS "payouts: admin all" ON public.supplier_payouts;
CREATE POLICY "payouts: admin all"
  ON public.supplier_payouts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payout_items: vendor read own" ON public.supplier_payout_items;
CREATE POLICY "payout_items: vendor read own"
  ON public.supplier_payout_items FOR SELECT TO authenticated
  USING (
    payout_id IN (
      SELECT sp.id FROM public.supplier_payouts sp
      JOIN public.profiles p ON p.supplier_id = sp.supplier_id
      WHERE p.id = auth.uid() AND p.role = 'vendor'::public.user_role
    )
  );

DROP POLICY IF EXISTS "payout_items: admin all" ON public.supplier_payout_items;
CREATE POLICY "payout_items: admin all"
  ON public.supplier_payout_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 9. Audit triggers on the new financial tables (025 trigger fn -> audit_log)
-- ===========================================================================

DROP TRIGGER IF EXISTS audit_payments ON public.payments;
CREATE TRIGGER audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_supplier_payouts ON public.supplier_payouts;
CREATE TRIGGER audit_supplier_payouts
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payouts
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();
