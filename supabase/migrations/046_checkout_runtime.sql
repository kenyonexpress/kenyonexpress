-- ============================================================================
-- 046_checkout_runtime.sql
-- Runtime bridge for the wired checkout on the dev remote (which sits at ~025
-- + 043/044/045): creates the tables/functions the checkout code path uses
-- and that the canonical drafts (026/027/028/042) will later own. Shapes
-- follow the live code contract (src/server/actions/payments/checkout.ts,
-- src/server/payments/finalize.ts, webhook route). Fully idempotent, so the
-- canonical migrations can supersede pieces of it later.
-- Must run BEFORE 047_checkout_settlement.sql (047 references coupon_codes,
-- payments, is_supplier_member).
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
  CREATE TYPE public.coupon_status AS ENUM ('issued', 'used', 'expired', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_kind AS ENUM ('charge', 'refund');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('initiated', 'redirected', 'succeeded', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Product / order item percent snapshots ----------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform_percent numeric(5,2)
    CHECK (platform_percent IS NULL OR (platform_percent >= 0 AND platform_percent <= 100));

COMMENT ON COLUMN public.products.platform_percent IS
  'Coupon upfront percent paid on site (default 10 handled in code). Owned by 026 canonically.';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS platform_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS cashback_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS cashback_amount_agorot integer;

-- 3. payments ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  kind                    public.payment_kind NOT NULL DEFAULT 'charge',
  status                  public.payment_status NOT NULL DEFAULT 'initiated',
  amount_ils              numeric(12,2) NOT NULL CHECK (amount_ils >= 0),
  currency                text NOT NULL DEFAULT 'ILS',
  wallet_applied_ils      numeric(12,2) NOT NULL DEFAULT 0,
  idempotency_key         text UNIQUE,
  cardcom_low_profile_id  text,
  cardcom_transaction_id  text,
  raw_response            jsonb,
  failure_code            text,
  failure_message         text,
  succeeded_at            timestamptz,
  failed_at               timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_low_profile ON public.payments (cardcom_low_profile_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.payments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. payment_webhook_events ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             text NOT NULL,
  external_event_id    text NOT NULL,
  signature_valid      boolean NOT NULL DEFAULT false,
  verified_against_api boolean NOT NULL DEFAULT false,
  payload              jsonb,
  payment_id           uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  processed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_dedup UNIQUE (provider, external_event_id)
);

-- 5. coupon_codes -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupon_codes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE,
  product_id         uuid REFERENCES public.products(id) ON DELETE SET NULL,
  order_item_id      uuid REFERENCES public.order_items(id) ON DELETE RESTRICT,
  user_id            uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  supplier_id        uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status             public.coupon_status NOT NULL DEFAULT 'issued',
  expires_at         timestamptz NOT NULL,
  qr_token           text NOT NULL,
  platform_percent   numeric(5,2),
  face_value_ils     numeric(12,2) NOT NULL DEFAULT 0,
  platform_paid_ils  numeric(12,2) NOT NULL DEFAULT 0,
  collect_amount_ils numeric(12,2) NOT NULL DEFAULT 0,
  redeemed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_codes_user ON public.coupon_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_order_item ON public.coupon_codes (order_item_id);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_supplier_status ON public.coupon_codes (supplier_id, status);

DROP TRIGGER IF EXISTS set_updated_at ON public.coupon_codes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.coupon_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. payment_tokens (001 shape, minimal) --------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cardcom_token text NOT NULL,
  last_4        text,
  card_brand    text,
  expiry_month  integer,
  expiry_year   integer,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_tokens_profile ON public.payment_tokens (profile_id);

-- 7. Wallet accounts + ledger + transfer fn -----------------------------------

CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  code        text UNIQUE,
  balance_ils numeric(12,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_accounts_owner CHECK (user_id IS NOT NULL OR code IS NOT NULL)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.wallet_accounts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Two shapes of wallet_accounts exist in the wild: the slim one created just
-- above (live DB, which stopped at 025) and the 026 one, which adds a NOT NULL
-- owner_type. On a from-zero run 026 wins the CREATE TABLE IF NOT EXISTS race,
-- so a bare (code) insert would fail with 23502. Branch on the column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'wallet_accounts'
      AND column_name  = 'owner_type'
  ) THEN
    EXECUTE $ins$
      INSERT INTO public.wallet_accounts (owner_type, code)
      VALUES ('platform', 'platform:revenue'),
             ('platform', 'platform:cashback_reserve'),
             ('platform', 'platform:adjustments')
      ON CONFLICT (code) DO NOTHING
    $ins$;
  ELSE
    EXECUTE $ins$
      INSERT INTO public.wallet_accounts (code)
      VALUES ('platform:revenue'), ('platform:cashback_reserve'), ('platform:adjustments')
      ON CONFLICT (code) DO NOTHING
    $ins$;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.wallet_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_account   uuid NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  credit_account  uuid NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  amount_ils      numeric(12,2) NOT NULL CHECK (amount_ils > 0),
  reason          text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  order_id        uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_entries_debit ON public.wallet_entries (debit_account);
CREATE INDEX IF NOT EXISTS idx_wallet_entries_credit ON public.wallet_entries (credit_account);

-- Double-entry transfer. Idempotent on p_idempotency. Platform accounts
-- (user_id IS NULL) may go negative; user accounts may not.
CREATE OR REPLACE FUNCTION public.fn_wallet_transfer(
  p_debit_account uuid,
  p_credit_account uuid,
  p_amount_ils numeric,
  p_reason text,
  p_idempotency text,
  p_order_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_existing uuid;
  v_debit public.wallet_accounts%ROWTYPE;
  v_entry uuid;
BEGIN
  IF p_amount_ils IS NULL OR p_amount_ils <= 0 THEN
    RAISE EXCEPTION 'transfer amount must be positive';
  END IF;
  IF p_debit_account = p_credit_account THEN
    RAISE EXCEPTION 'transfer accounts must differ';
  END IF;

  SELECT id INTO v_existing FROM public.wallet_entries WHERE idempotency_key = p_idempotency;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- deterministic lock order prevents deadlocks
  PERFORM 1 FROM public.wallet_accounts
   WHERE id IN (p_debit_account, p_credit_account)
   ORDER BY id FOR UPDATE;

  SELECT * INTO v_debit FROM public.wallet_accounts WHERE id = p_debit_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'debit account not found';
  END IF;
  IF v_debit.user_id IS NOT NULL AND v_debit.balance_ils < p_amount_ils THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  UPDATE public.wallet_accounts SET balance_ils = balance_ils - p_amount_ils
   WHERE id = p_debit_account;
  UPDATE public.wallet_accounts SET balance_ils = balance_ils + p_amount_ils
   WHERE id = p_credit_account;

  INSERT INTO public.wallet_entries
    (debit_account, credit_account, amount_ils, reason, idempotency_key, order_id)
  VALUES
    (p_debit_account, p_credit_account, p_amount_ils, p_reason, p_idempotency, p_order_id)
  RETURNING id INTO v_entry;

  RETURN v_entry;
END;
$$;

-- SEC-01 lesson from ARCHITECTURE-SECURITY: money functions are service-only.
REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid) TO service_role;

-- 8. is_supplier_member stub (supplier portal lands with 028) ------------------

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_supplier_member'
  ) THEN
    CREATE FUNCTION public.is_supplier_member(p_supplier_id uuid)
    RETURNS boolean LANGUAGE sql STABLE AS
    'SELECT false';
  END IF;
END $$;

-- 9. RLS ----------------------------------------------------------------------

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_entries ENABLE ROW LEVEL SECURITY;

-- Reads for owners; all writes stay with the service role (no write policies).
DROP POLICY IF EXISTS payments_owner_read ON public.payments;
CREATE POLICY payments_owner_read ON public.payments
  FOR SELECT USING (
    order_id IN (SELECT o.id FROM public.orders o WHERE o.user_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS coupon_codes_owner_read ON public.coupon_codes;
CREATE POLICY coupon_codes_owner_read ON public.coupon_codes
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS payment_tokens_owner_read ON public.payment_tokens;
CREATE POLICY payment_tokens_owner_read ON public.payment_tokens
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS wallet_accounts_owner_read ON public.wallet_accounts;
CREATE POLICY wallet_accounts_owner_read ON public.wallet_accounts
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS wallet_entries_admin_read ON public.wallet_entries;
CREATE POLICY wallet_entries_admin_read ON public.wallet_entries
  FOR SELECT USING (public.is_admin());
