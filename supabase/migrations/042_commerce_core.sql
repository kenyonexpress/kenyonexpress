-- Migration 042: Commerce core engine
-- Additive schema for integer-money snapshots, commission ledger, and deferred cashback.
-- Requires migrations 026, 027, and 035. Do not apply before their hardening is active.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0. Hard prerequisites and policy preservation preflight
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.products') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_items') IS NULL
     OR to_regclass('public.coupon_codes') IS NULL
     OR to_regclass('public.wallet_accounts') IS NULL
     OR to_regclass('public.wallet_transactions') IS NULL THEN
    RAISE EXCEPTION '042_commerce_core requires commerce migrations 026 and 027';
  END IF;

  IF to_regprocedure(
    'public.fn_wallet_transfer(uuid,uuid,numeric,public.wallet_reason,text,uuid,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION '042_commerce_core requires fn_wallet_transfer from migration 026';
  END IF;

  IF to_regprocedure('public.redeem_coupon(text,text)') IS NULL
     OR to_regprocedure('public.update_shipping_status(uuid,text,text,text)') IS NULL
     OR to_regprocedure('public.is_supplier_member(uuid)') IS NULL THEN
    RAISE EXCEPTION '042_commerce_core requires supplier lifecycle functions from migration 027';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products: content_uploader select own'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products: content_uploader insert'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products: content_uploader update'
  ) THEN
    RAISE EXCEPTION '042_commerce_core refuses to run without content_uploader product policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products: supplier member read own'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'order_items_supplier_read'
  ) THEN
    RAISE EXCEPTION '042_commerce_core refuses to run without supplier read policies';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_wallet_transfer(
  uuid,
  uuid,
  numeric,
  public.wallet_reason,
  text,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer(
  uuid,
  uuid,
  numeric,
  public.wallet_reason,
  text,
  uuid,
  uuid,
  text
) TO service_role;

DROP TABLE IF EXISTS pg_temp.commerce_core_policy_snapshot;
CREATE TEMP TABLE commerce_core_policy_snapshot AS
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles::text AS roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (
      tablename = 'products'
      AND policyname IN (
        'products: content_uploader select own',
        'products: content_uploader insert',
        'products: content_uploader update',
        'products: supplier member read own'
      )
    )
    OR (
      tablename = 'order_items'
      AND policyname = 'order_items_supplier_read'
    )
  );

-- ---------------------------------------------------------------------------
-- 1. Product-owned commerce controls
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cashback_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_expiry_days integer;

UPDATE public.products
SET cashback_percent = 0
WHERE cashback_percent IS NULL;

ALTER TABLE public.products
  ALTER COLUMN cashback_percent SET DEFAULT 0,
  ALTER COLUMN cashback_percent SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_cashback_percent_range'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_cashback_percent_range
      CHECK (cashback_percent BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_coupon_expiry_days_nonnegative'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_coupon_expiry_days_nonnegative
      CHECK (coupon_expiry_days >= 0);
  END IF;
END;
$$;

-- Physical products do not expire as coupons. Zero is an explicit per-product
-- non-coupon value, not a coupon default.
UPDATE public.products
SET coupon_expiry_days = 0
WHERE type <> 'coupon'::public.product_type
  AND coupon_expiry_days IS NULL;

-- Existing coupon products may carry the historical setting in attributes.
UPDATE public.products
SET coupon_expiry_days = (attributes->>'coupon_expiry_days')::integer
WHERE type = 'coupon'::public.product_type
  AND coupon_expiry_days IS NULL
  AND attributes ? 'coupon_expiry_days'
  AND attributes->>'coupon_expiry_days' ~ '^[1-9][0-9]*$';

-- If issued coupons exist, derive the product setting from their latest
-- issuance duration. No global coupon expiry default is introduced.
UPDATE public.products p
SET coupon_expiry_days = inferred.expiry_days
FROM (
  SELECT
    cc.product_id,
    GREATEST(
      1,
      round(
        extract(epoch FROM max(cc.expires_at - cc.created_at)) / 86400
      )::integer
    ) AS expiry_days
  FROM public.coupon_codes cc
  WHERE cc.deleted_at IS NULL
  GROUP BY cc.product_id
) inferred
WHERE p.id = inferred.product_id
  AND p.type = 'coupon'::public.product_type
  AND p.coupon_expiry_days IS NULL;

DO $$
DECLARE
  v_missing uuid[];
BEGIN
  SELECT array_agg(id ORDER BY id) INTO v_missing
  FROM public.products
  WHERE coupon_expiry_days IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'coupon_expiry_days requires explicit per-product values before 042 can finish: %',
      v_missing;
  END IF;
END;
$$;

ALTER TABLE public.products
  ALTER COLUMN coupon_expiry_days SET NOT NULL,
  ALTER COLUMN coupon_expiry_days DROP DEFAULT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.products WHERE supplier_id IS NULL
  ) THEN
    RAISE EXCEPTION 'all products require supplier_id before 042 can finish';
  END IF;
END;
$$;

ALTER TABLE public.products
  ALTER COLUMN supplier_id SET NOT NULL;

COMMENT ON COLUMN public.products.cashback_percent IS
  'Admin-controlled per-product percentage. Cashback basis is customer_pays_now only.';
COMMENT ON COLUMN public.products.coupon_expiry_days IS
  'Admin-controlled per-product expiry. No database default is allowed.';

-- ---------------------------------------------------------------------------
-- 2. Integer-money snapshots on orders and order_items
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal_agorot integer,
  ADD COLUMN IF NOT EXISTS discount_agorot integer,
  ADD COLUMN IF NOT EXISTS wallet_applied_agorot integer,
  ADD COLUMN IF NOT EXISTS customer_pays_now_agorot integer;

UPDATE public.orders
SET subtotal_agorot = round(subtotal_ils * 100)::integer
WHERE subtotal_agorot IS NULL;

UPDATE public.orders
SET discount_agorot = round(discount_ils * 100)::integer
WHERE discount_agorot IS NULL;

UPDATE public.orders
SET wallet_applied_agorot = round(cashback_applied_ils * 100)::integer
WHERE wallet_applied_agorot IS NULL;

UPDATE public.orders
SET customer_pays_now_agorot = GREATEST(
  0,
  round(total_ils * 100)::integer
)
WHERE customer_pays_now_agorot IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN subtotal_agorot SET NOT NULL,
  ALTER COLUMN discount_agorot SET NOT NULL,
  ALTER COLUMN discount_agorot SET DEFAULT 0,
  ALTER COLUMN wallet_applied_agorot SET NOT NULL,
  ALTER COLUMN wallet_applied_agorot SET DEFAULT 0,
  ALTER COLUMN customer_pays_now_agorot SET NOT NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_price_agorot integer,
  ADD COLUMN IF NOT EXISTS face_value_agorot integer,
  ADD COLUMN IF NOT EXISTS customer_pays_now_agorot integer,
  ADD COLUMN IF NOT EXISTS platform_fee_agorot integer,
  ADD COLUMN IF NOT EXISTS supplier_due_agorot integer,
  ADD COLUMN IF NOT EXISTS cashback_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS cashback_amount_agorot integer;

UPDATE public.order_items oi
SET supplier_id = p.supplier_id
FROM public.products p
WHERE p.id = oi.product_id
  AND oi.supplier_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.order_items WHERE supplier_id IS NULL
  ) THEN
    RAISE EXCEPTION 'all order items require supplier_id before 042 can finish';
  END IF;
END;
$$;

ALTER TABLE public.order_items
  ALTER COLUMN supplier_id SET NOT NULL;

UPDATE public.order_items oi
SET cashback_percent = p.cashback_percent
FROM public.products p
WHERE p.id = oi.product_id
  AND oi.cashback_percent IS NULL;

UPDATE public.order_items
SET
  unit_price_agorot = COALESCE(
    unit_price_agorot,
    round(unit_price_ils * 100)::integer
  ),
  face_value_agorot = COALESCE(
    face_value_agorot,
    round(total_price_ils * 100)::integer
  ),
  customer_pays_now_agorot = COALESCE(
    customer_pays_now_agorot,
    round(
      CASE
        WHEN product_type = 'coupon'::public.product_type
          THEN charged_on_site_ils
        ELSE total_price_ils
      END * 100
    )::integer
  ),
  platform_fee_agorot = COALESCE(
    platform_fee_agorot,
    round(platform_fee_ils * 100)::integer
  ),
  supplier_due_agorot = COALESCE(
    supplier_due_agorot,
    round(supplier_due_ils * 100)::integer
  ),
  cashback_percent = COALESCE(cashback_percent, 0);

UPDATE public.order_items
SET cashback_amount_agorot = round(
  customer_pays_now_agorot * cashback_percent / 100
)::integer
WHERE cashback_amount_agorot IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE unit_price_agorot IS NULL
       OR face_value_agorot IS NULL
       OR customer_pays_now_agorot IS NULL
       OR platform_fee_agorot IS NULL
       OR supplier_due_agorot IS NULL
       OR cashback_percent IS NULL
       OR cashback_amount_agorot IS NULL
  ) THEN
    RAISE EXCEPTION '042_commerce_core could not backfill all order item snapshots';
  END IF;
END;
$$;

ALTER TABLE public.order_items
  ALTER COLUMN unit_price_agorot SET NOT NULL,
  ALTER COLUMN face_value_agorot SET NOT NULL,
  ALTER COLUMN customer_pays_now_agorot SET NOT NULL,
  ALTER COLUMN platform_fee_agorot SET NOT NULL,
  ALTER COLUMN supplier_due_agorot SET NOT NULL,
  ALTER COLUMN cashback_percent SET NOT NULL,
  ALTER COLUMN cashback_amount_agorot SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.order_items'::regclass
      AND conname = 'order_items_cashback_percent_range'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_cashback_percent_range
      CHECK (cashback_percent BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.order_items'::regclass
      AND conname = 'order_items_agorot_nonnegative'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_agorot_nonnegative
      CHECK (
        unit_price_agorot >= 0
        AND face_value_agorot >= 0
        AND customer_pays_now_agorot >= 0
        AND platform_fee_agorot >= 0
        AND supplier_due_agorot >= 0
        AND cashback_amount_agorot >= 0
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Append-only commission ledger
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.commission_ledger_event AS ENUM ('accrual', 'reversal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.commission_ledger_status AS ENUM ('pending', 'earned', 'reversed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 uuid NOT NULL
                           CONSTRAINT commission_ledger_order_id_orders_id_fk
                           REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id            uuid NOT NULL
                           CONSTRAINT commission_ledger_order_item_id_order_items_id_fk
                           REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id               uuid
                           CONSTRAINT commission_ledger_product_id_products_id_fk
                           REFERENCES public.products(id) ON DELETE SET NULL,
  supplier_id              uuid NOT NULL
                           CONSTRAINT commission_ledger_supplier_id_suppliers_id_fk
                           REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  product_type             public.product_type NOT NULL,
  event                    public.commission_ledger_event NOT NULL,
  status                   public.commission_ledger_status NOT NULL DEFAULT 'pending',
  customer_pays_now_agorot integer NOT NULL,
  platform_percent_bps     integer NOT NULL,
  platform_fee_agorot      integer NOT NULL,
  supplier_due_agorot      integer NOT NULL,
  cashback_percent_bps     integer NOT NULL,
  cashback_amount_agorot   integer NOT NULL,
  reversal_of_id           uuid REFERENCES public.commission_ledger(id) ON DELETE RESTRICT,
  idempotency_key          text NOT NULL UNIQUE,
  earned_at                timestamptz,
  reversed_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_ledger_customer_pays_now_nonnegative
    CHECK (customer_pays_now_agorot >= 0),
  CONSTRAINT commission_ledger_platform_percent_bps_range
    CHECK (platform_percent_bps BETWEEN 0 AND 10000),
  CONSTRAINT commission_ledger_platform_fee_nonnegative
    CHECK (platform_fee_agorot >= 0),
  CONSTRAINT commission_ledger_supplier_due_nonnegative
    CHECK (supplier_due_agorot >= 0),
  CONSTRAINT commission_ledger_cashback_percent_bps_range
    CHECK (cashback_percent_bps BETWEEN 0 AND 10000),
  CONSTRAINT commission_ledger_cashback_amount_nonnegative
    CHECK (cashback_amount_agorot >= 0),
  CONSTRAINT commission_ledger_reversal_shape CHECK (
    (event = 'accrual'::public.commission_ledger_event AND reversal_of_id IS NULL)
    OR
    (event = 'reversal'::public.commission_ledger_event AND reversal_of_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS commission_ledger_supplier_status_idx
  ON public.commission_ledger (supplier_id, status, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS commission_ledger_order_item_idx
  ON public.commission_ledger (order_item_id, created_at);
CREATE INDEX IF NOT EXISTS commission_ledger_order_idx
  ON public.commission_ledger (order_id, created_at);

DROP TRIGGER IF EXISTS set_updated_at ON public.commission_ledger;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_ledger: user read own" ON public.commission_ledger;
CREATE POLICY "commission_ledger: user read own"
  ON public.commission_ledger FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "commission_ledger: supplier read own" ON public.commission_ledger;
CREATE POLICY "commission_ledger: supplier read own"
  ON public.commission_ledger FOR SELECT TO authenticated
  USING (public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS "commission_ledger: admin read" ON public.commission_ledger;
CREATE POLICY "commission_ledger: admin read"
  ON public.commission_ledger FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.commission_ledger
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.commission_ledger FROM anon;
GRANT SELECT ON public.commission_ledger TO authenticated;

CREATE TABLE IF NOT EXISTS public.cashback_reversal_debts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL
                CONSTRAINT cashback_reversal_debts_user_id_users_id_fk
                REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL UNIQUE
                CONSTRAINT cashback_reversal_debts_order_item_id_order_items_id_fk
                REFERENCES public.order_items(id) ON DELETE RESTRICT,
  amount_agorot integer NOT NULL,
  status        text NOT NULL DEFAULT 'outstanding'
                CONSTRAINT cashback_reversal_debts_status_check
                CHECK (status IN ('outstanding', 'settled')),
  settled_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_reversal_debts_amount_positive
    CHECK (amount_agorot > 0)
);

CREATE INDEX IF NOT EXISTS cashback_reversal_debts_user_status_idx
  ON public.cashback_reversal_debts (user_id, status, created_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS set_updated_at ON public.cashback_reversal_debts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.cashback_reversal_debts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cashback_reversal_debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cashback_debts: user read own" ON public.cashback_reversal_debts;
CREATE POLICY "cashback_debts: user read own"
  ON public.cashback_reversal_debts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cashback_debts: admin read" ON public.cashback_reversal_debts;
CREATE POLICY "cashback_debts: admin read"
  ON public.cashback_reversal_debts FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.cashback_reversal_debts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cashback_reversal_debts
  FROM PUBLIC, authenticated;
GRANT SELECT ON public.cashback_reversal_debts TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ledger accrual snapshots
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_snapshot_commission_ledger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RAISE EXCEPTION 'order item % requires supplier_id', NEW.id;
  END IF;

  INSERT INTO public.commission_ledger (
    order_id,
    order_item_id,
    product_id,
    supplier_id,
    product_type,
    event,
    status,
    customer_pays_now_agorot,
    platform_percent_bps,
    platform_fee_agorot,
    supplier_due_agorot,
    cashback_percent_bps,
    cashback_amount_agorot,
    idempotency_key
  )
  VALUES (
    NEW.order_id,
    NEW.id,
    NEW.product_id,
    NEW.supplier_id,
    NEW.product_type,
    'accrual'::public.commission_ledger_event,
    'pending'::public.commission_ledger_status,
    NEW.customer_pays_now_agorot,
    round(NEW.platform_percent * 100)::integer,
    NEW.platform_fee_agorot,
    NEW.supplier_due_agorot,
    round(NEW.cashback_percent * 100)::integer,
    NEW.cashback_amount_agorot,
    'commission:accrual:' || NEW.id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_commission_ledger ON public.order_items;
CREATE TRIGGER snapshot_commission_ledger
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_snapshot_commission_ledger();

INSERT INTO public.commission_ledger (
  order_id,
  order_item_id,
  product_id,
  supplier_id,
  product_type,
  event,
  status,
  customer_pays_now_agorot,
  platform_percent_bps,
  platform_fee_agorot,
  supplier_due_agorot,
  cashback_percent_bps,
  cashback_amount_agorot,
  idempotency_key
)
SELECT
  oi.order_id,
  oi.id,
  oi.product_id,
  oi.supplier_id,
  oi.product_type,
  'accrual'::public.commission_ledger_event,
  CASE
    WHEN oi.item_status IN (
      'cancelled'::public.order_item_status,
      'refunded'::public.order_item_status
    ) THEN 'reversed'::public.commission_ledger_status
    WHEN (
      oi.product_type = 'physical'::public.product_type
      AND oi.item_status IN (
        'shipped'::public.order_item_status,
        'delivered'::public.order_item_status
      )
    ) OR (
      oi.product_type = 'coupon'::public.product_type
      AND EXISTS (
        SELECT 1 FROM public.coupon_codes cc
        WHERE cc.order_item_id = oi.id
          AND cc.status = 'used'::public.coupon_status
      )
    ) THEN 'earned'::public.commission_ledger_status
    ELSE 'pending'::public.commission_ledger_status
  END,
  oi.customer_pays_now_agorot,
  round(oi.platform_percent * 100)::integer,
  oi.platform_fee_agorot,
  oi.supplier_due_agorot,
  round(oi.cashback_percent * 100)::integer,
  oi.cashback_amount_agorot,
  'commission:accrual:' || oi.id::text
FROM public.order_items oi
WHERE oi.supplier_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Deferred wallet cashback
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_credit_order_item_cashback(
  p_order_item_id uuid,
  p_lifecycle_event text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_ledger public.commission_ledger%ROWTYPE;
  v_reserve_account uuid;
  v_user_account uuid;
  v_wallet_tx uuid;
BEGIN
  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cashback order item not found: %', p_order_item_id;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_item.order_id;

  SELECT * INTO v_ledger
  FROM public.commission_ledger
  WHERE order_item_id = v_item.id
    AND event = 'accrual'::public.commission_ledger_event
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission accrual missing for order item %', v_item.id;
  END IF;

  IF v_ledger.status = 'reversed'::public.commission_ledger_status THEN
    RETURN NULL;
  END IF;

  UPDATE public.commission_ledger
  SET status = 'earned'::public.commission_ledger_status,
      earned_at = COALESCE(earned_at, now())
  WHERE id = v_ledger.id;

  IF v_item.cashback_amount_agorot = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.wallet_accounts (owner_type, user_id)
  VALUES ('user', v_order.user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_reserve_account
  FROM public.wallet_accounts
  WHERE code = 'platform:cashback_reserve';

  SELECT id INTO v_user_account
  FROM public.wallet_accounts
  WHERE user_id = v_order.user_id;

  IF v_reserve_account IS NULL OR v_user_account IS NULL THEN
    RAISE EXCEPTION 'cashback wallet accounts are missing';
  END IF;

  SELECT public.fn_wallet_transfer(
    v_reserve_account,
    v_user_account,
    v_item.cashback_amount_agorot::numeric / 100,
    'cashback_earn'::public.wallet_reason,
    'cashback:earn:' || v_item.id::text,
    v_item.order_id,
    v_item.id,
    'Deferred cashback after ' || p_lifecycle_event
  ) INTO v_wallet_tx;

  RETURN v_wallet_tx;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reverse_order_item_cashback(
  p_order_item_id uuid,
  p_lifecycle_event text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_ledger public.commission_ledger%ROWTYPE;
  v_earn_tx public.wallet_transactions%ROWTYPE;
  v_reserve_account uuid;
  v_user_account uuid;
  v_wallet_tx uuid;
  v_available_ils numeric(12,2);
  v_recover_ils numeric(12,2);
  v_debt_agorot integer;
BEGIN
  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_item.order_id;

  SELECT * INTO v_ledger
  FROM public.commission_ledger
  WHERE order_item_id = v_item.id
    AND event = 'accrual'::public.commission_ledger_event
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_earn_tx
  FROM public.wallet_transactions
  WHERE idempotency_key = 'cashback:earn:' || v_item.id::text;

  IF FOUND THEN
    SELECT id INTO v_reserve_account
    FROM public.wallet_accounts
    WHERE code = 'platform:cashback_reserve';

    SELECT id INTO v_user_account
    FROM public.wallet_accounts
    WHERE user_id = v_order.user_id;

    IF v_reserve_account IS NULL OR v_user_account IS NULL THEN
      RAISE EXCEPTION 'cashback reversal wallet accounts are missing';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.cashback_reversal_debts
      WHERE order_item_id = v_item.id
    ) THEN
      PERFORM 1
      FROM public.wallet_accounts
      WHERE id IN (v_user_account, v_reserve_account)
      ORDER BY id
      FOR UPDATE;

      SELECT GREATEST(balance_ils, 0)
      INTO v_available_ils
      FROM public.wallet_accounts
      WHERE id = v_user_account;

      v_recover_ils := LEAST(v_available_ils, v_earn_tx.amount_ils);
      v_debt_agorot := round(
        (v_earn_tx.amount_ils - v_recover_ils) * 100
      )::integer;

      IF v_recover_ils > 0 THEN
        SELECT public.fn_wallet_transfer(
          v_user_account,
          v_reserve_account,
          v_recover_ils,
          'manual_adjust'::public.wallet_reason,
          'cashback:reverse:' || v_item.id::text,
          v_item.order_id,
          v_item.id,
          'Cashback reversal after ' || p_lifecycle_event
        ) INTO v_wallet_tx;
      END IF;

      IF v_debt_agorot > 0 THEN
        INSERT INTO public.cashback_reversal_debts (
          user_id,
          order_item_id,
          amount_agorot
        )
        VALUES (
          v_order.user_id,
          v_item.id,
          v_debt_agorot
        )
        ON CONFLICT (order_item_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  UPDATE public.commission_ledger
  SET status = 'reversed'::public.commission_ledger_status,
      reversed_at = COALESCE(reversed_at, now())
  WHERE id = v_ledger.id;

  INSERT INTO public.commission_ledger (
    order_id,
    order_item_id,
    product_id,
    supplier_id,
    product_type,
    event,
    status,
    customer_pays_now_agorot,
    platform_percent_bps,
    platform_fee_agorot,
    supplier_due_agorot,
    cashback_percent_bps,
    cashback_amount_agorot,
    reversal_of_id,
    idempotency_key,
    earned_at
  )
  VALUES (
    v_ledger.order_id,
    v_ledger.order_item_id,
    v_ledger.product_id,
    v_ledger.supplier_id,
    v_ledger.product_type,
    'reversal'::public.commission_ledger_event,
    'earned'::public.commission_ledger_status,
    v_ledger.customer_pays_now_agorot,
    v_ledger.platform_percent_bps,
    v_ledger.platform_fee_agorot,
    v_ledger.supplier_due_agorot,
    v_ledger.cashback_percent_bps,
    v_ledger.cashback_amount_agorot,
    v_ledger.id,
    'commission:reversal:' || v_item.id::text,
    now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_wallet_tx;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_credit_order_item_cashback(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reverse_order_item_cashback(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_credit_order_item_cashback(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reverse_order_item_cashback(uuid, text)
  TO service_role;

DO $$
DECLARE
  v_item record;
BEGIN
  FOR v_item IN
    SELECT oi.id
    FROM public.order_items oi
    WHERE (
      oi.product_type = 'physical'::public.product_type
      AND oi.item_status IN (
        'shipped'::public.order_item_status,
        'delivered'::public.order_item_status
      )
    ) OR (
      oi.product_type = 'coupon'::public.product_type
      AND EXISTS (
        SELECT 1
        FROM public.coupon_codes cc
        WHERE cc.order_item_id = oi.id
          AND cc.status = 'used'::public.coupon_status
      )
    )
  LOOP
    PERFORM public.fn_credit_order_item_cashback(
      v_item.id,
      'migration_backfill'
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lifecycle triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_coupon_cashback_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'used'::public.coupon_status THEN
    PERFORM public.fn_credit_order_item_cashback(
      NEW.order_item_id,
      'coupon_redeemed'
    );
  ELSIF OLD.status IS DISTINCT FROM NEW.status
        AND NEW.status = 'refunded'::public.coupon_status THEN
    PERFORM public.fn_reverse_order_item_cashback(
      NEW.order_item_id,
      'coupon_refunded'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coupon_cashback_lifecycle ON public.coupon_codes;
CREATE TRIGGER coupon_cashback_lifecycle
  AFTER UPDATE OF status ON public.coupon_codes
  FOR EACH ROW EXECUTE FUNCTION public.fn_coupon_cashback_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_order_item_cashback_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF OLD.item_status IS DISTINCT FROM NEW.item_status
     AND NEW.product_type = 'physical'::public.product_type
     AND NEW.item_status = 'shipped'::public.order_item_status THEN
    PERFORM public.fn_credit_order_item_cashback(
      NEW.id,
      'physical_shipped'
    );
  ELSIF OLD.item_status IS DISTINCT FROM NEW.item_status
        AND NEW.item_status IN (
          'cancelled'::public.order_item_status,
          'refunded'::public.order_item_status
        ) THEN
    PERFORM public.fn_reverse_order_item_cashback(
      NEW.id,
      'order_item_' || NEW.item_status::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_item_cashback_lifecycle ON public.order_items;
CREATE TRIGGER order_item_cashback_lifecycle
  AFTER UPDATE OF item_status ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_item_cashback_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_order_cashback_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_item record;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN (
       'cancelled'::public.order_status,
       'refunded'::public.order_status
     ) THEN
    FOR v_item IN
      SELECT id
      FROM public.order_items
      WHERE order_id = NEW.id
        AND deleted_at IS NULL
    LOOP
      PERFORM public.fn_reverse_order_item_cashback(
        v_item.id,
        'order_' || NEW.status::text
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_cashback_lifecycle ON public.orders;
CREATE TRIGGER order_cashback_lifecycle
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_cashback_lifecycle();

-- Audit the financial ledger when the canonical audit function is present.
DO $$
BEGIN
  IF to_regprocedure('public.audit_log_trigger_fn()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_commission_ledger ON public.commission_ledger';
    EXECUTE '
      CREATE TRIGGER audit_commission_ledger
      AFTER INSERT OR UPDATE OR DELETE ON public.commission_ledger
      FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn()
    ';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Policy preservation postflight
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products: content_uploader select own'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products: content_uploader insert'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products: content_uploader update'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'products: supplier member read own'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'order_items_supplier_read'
  ) THEN
    RAISE EXCEPTION '042_commerce_core policy preservation check failed';
  END IF;

  IF EXISTS (
    (
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM commerce_core_policy_snapshot
      EXCEPT
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles::text,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          (
            tablename = 'products'
            AND policyname IN (
              'products: content_uploader select own',
              'products: content_uploader insert',
              'products: content_uploader update',
              'products: supplier member read own'
            )
          )
          OR (
            tablename = 'order_items'
            AND policyname = 'order_items_supplier_read'
          )
        )
    )
    UNION ALL
    (
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles::text,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          (
            tablename = 'products'
            AND policyname IN (
              'products: content_uploader select own',
              'products: content_uploader insert',
              'products: content_uploader update',
              'products: supplier member read own'
            )
          )
          OR (
            tablename = 'order_items'
            AND policyname = 'order_items_supplier_read'
          )
        )
      EXCEPT
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM commerce_core_policy_snapshot
    )
  ) THEN
    RAISE EXCEPTION '042_commerce_core changed a protected policy definition';
  END IF;
END;
$$;

DROP TABLE commerce_core_policy_snapshot;
