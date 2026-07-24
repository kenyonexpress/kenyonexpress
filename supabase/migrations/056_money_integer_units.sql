-- ============================================================================
-- 056_money_integer_units.sql  (spec number 034; renumbered 033->050 ...
-- 039->056 because 033-035 already exist in this tree and 049 was the last
-- used number; see LEDGER-DESIGN.md section 0)
--
-- Money convergence: every numeric ILS money column becomes an integer agorot
-- column (x100), every numeric percent column becomes an integer basis-points
-- column (10% = 1000 bp, also x100). Strategy per column:
--   1. ADD COLUMN IF NOT EXISTS <new> integer
--   2. backfill new = round(old * 100)::integer where new IS NULL
--   3. verify in a DO block: RAISE EXCEPTION on any drift row
--   4. RENAME old -> <old>_legacy and DROP NOT NULL on the legacy column
-- Old columns are kept as *_legacy until a later cleanup migration (which
-- will also add NOT NULL / CHECK constraints to the new columns and drop the
-- legacy ones after code cutover).
-- Columns whose agorot twin was already created by 042 with richer backfill
-- formulas (orders.subtotal_agorot etc.) are NOT re-verified against the
-- legacy column (p_verify => false): 042 owns their backfill; here we only
-- fill NULLs and rename the ils column away.
-- coupon_deals.platform_price and coupon_deals.discount_percentage are
-- GENERATED columns and cannot be converted in place: they are dropped and
-- replaced by the admin-set absolute coupon_price_agorot (binding model 2026-07-24).
--
-- ROLLBACK NOTE: no data is destroyed except the two GENERATED columns
-- (recomputable by definition). To roll back per column:
--   ALTER TABLE t DROP COLUMN IF EXISTS <new>;
--   ALTER TABLE t RENAME COLUMN <old>_legacy TO <old>;  -- restore NOT NULL manually where it existed
-- For coupon_deals, recreate the 015 generated columns:
--   platform_price numeric(10,2) GENERATED ALWAYS AS (ROUND(original_price * 0.10, 2)) STORED
--   discount_percentage numeric(5,2) GENERATED ALWAYS AS (90.00) STORED
-- Also re-run the 027 definition of product_platform_percent.
--
-- WARNING (cutover): SQL functions that reference the old column names by
-- text (product_platform_percent, the 027 settlement functions) break after
-- the rename. product_platform_percent is redefined at the bottom of this
-- file; the 027 settlement functions are legacy-in-runoff and get redefined
-- or retired in the cleanup migration. Views track renames automatically.
-- ============================================================================

-- 1. Conversion helper -------------------------------------------------------
-- One factor (x100) serves both conversions: ILS -> agorot and percent -> bp.
-- Skips gracefully when the table or the source column does not exist (this
-- tree's migrations are layered: some live DBs lack 026/027 tables).

CREATE OR REPLACE FUNCTION public.fn_money_col_to_int(
  p_table text,
  p_old text,
  p_new text,
  p_verify boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_drift bigint;
BEGIN
  IF to_regclass('public.' || quote_ident(p_table)) IS NULL THEN
    RAISE NOTICE 'fn_money_col_to_int: table public.% missing, skipping %', p_table, p_old;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_old
  ) THEN
    -- Already migrated on a previous run (old column renamed away) or never
    -- existed on this DB layer. Idempotent no-op.
    RAISE NOTICE 'fn_money_col_to_int: column %.% missing, skipping', p_table, p_old;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I integer', p_table, p_new);

  EXECUTE format(
    'UPDATE public.%I SET %I = round(%I * 100)::integer WHERE %I IS NULL AND %I IS NOT NULL',
    p_table, p_new, p_old, p_new, p_old);

  IF p_verify THEN
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND %I IS DISTINCT FROM round(%I * 100)::integer',
      p_table, p_old, p_new, p_old) INTO v_drift;
    IF v_drift > 0 THEN
      RAISE EXCEPTION 'agorot/bp backfill drift on %.% -> %: % rows differ from round(old * 100)',
        p_table, p_old, p_new, v_drift;
    END IF;
  END IF;

  EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', p_table, p_old, p_old || '_legacy');
  -- Legacy columns must not block new inserts that only write the new units.
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', p_table, p_old || '_legacy');
END;
$$;

-- 2. coupon_deals GENERATED columns: drop, convert base, recreate ------------

DO $$ BEGIN
  IF to_regclass('public.coupon_deals') IS NOT NULL THEN
    ALTER TABLE public.coupon_deals DROP COLUMN IF EXISTS platform_price;
    ALTER TABLE public.coupon_deals DROP COLUMN IF EXISTS discount_percentage;
  END IF;
END $$;

SELECT public.fn_money_col_to_int('coupon_deals', 'original_price', 'original_price_agorot');

DO $$ BEGIN
  IF to_regclass('public.coupon_deals') IS NOT NULL THEN
    -- Binding business model (2026-07-24): the coupon site price is an ABSOLUTE
    -- amount the admin sets per deal, and the customer pays exactly it. The old
    -- GENERATED 10%-of-face platform_price and fixed 90% discount are retired,
    -- deliberately NOT recreated in new units. Existing rows get a one-time
    -- backfill from the legacy 10% value so no live deal is left priceless;
    -- from then on the column is admin-owned.
    ALTER TABLE public.coupon_deals
      ADD COLUMN IF NOT EXISTS coupon_price_agorot integer
        CHECK (coupon_price_agorot IS NULL OR coupon_price_agorot > 0);
    UPDATE public.coupon_deals
      SET coupon_price_agorot = (round((original_price_agorot)::numeric * 0.10))::integer
      WHERE coupon_price_agorot IS NULL AND original_price_agorot IS NOT NULL;
    COMMENT ON COLUMN public.coupon_deals.coupon_price_agorot IS
      'Absolute site price in agorot, set by admin per deal. The customer pays exactly this at Cardcom. No percent derivation.';
  END IF;
END $$;

-- 3. Money columns: ILS -> agorot -------------------------------------------

-- payments (046)
SELECT public.fn_money_col_to_int('payments', 'amount_ils', 'amount_agorot');
SELECT public.fn_money_col_to_int('payments', 'wallet_applied_ils', 'wallet_applied_agorot');

-- coupon_codes (046/027)
SELECT public.fn_money_col_to_int('coupon_codes', 'face_value_ils', 'face_value_agorot');
SELECT public.fn_money_col_to_int('coupon_codes', 'platform_paid_ils', 'platform_paid_agorot');
SELECT public.fn_money_col_to_int('coupon_codes', 'collect_amount_ils', 'collect_amount_agorot');

-- orders (007; subtotal/discount agorot twins created by 042 => no re-verify)
SELECT public.fn_money_col_to_int('orders', 'subtotal_ils', 'subtotal_agorot', false);
SELECT public.fn_money_col_to_int('orders', 'discount_ils', 'discount_agorot', false);
SELECT public.fn_money_col_to_int('orders', 'cashback_applied_ils', 'cashback_applied_agorot');
SELECT public.fn_money_col_to_int('orders', 'total_ils', 'total_agorot');

-- order_items (007/026; 042 twins => no re-verify on those)
SELECT public.fn_money_col_to_int('order_items', 'unit_price_ils', 'unit_price_agorot', false);
SELECT public.fn_money_col_to_int('order_items', 'total_price_ils', 'total_price_agorot');
SELECT public.fn_money_col_to_int('order_items', 'supplier_payout_ils', 'supplier_payout_agorot');
SELECT public.fn_money_col_to_int('order_items', 'cashback_earned_ils', 'cashback_earned_agorot');
SELECT public.fn_money_col_to_int('order_items', 'platform_fee_ils', 'platform_fee_agorot', false);
SELECT public.fn_money_col_to_int('order_items', 'supplier_due_ils', 'supplier_due_agorot', false);
SELECT public.fn_money_col_to_int('order_items', 'charged_on_site_ils', 'charged_on_site_agorot');
SELECT public.fn_money_col_to_int('order_items', 'balance_due_at_business_ils', 'balance_due_at_business_agorot');

-- wallet_balances (006)
SELECT public.fn_money_col_to_int('wallet_balances', 'balance_ils', 'balance_agorot');
SELECT public.fn_money_col_to_int('wallet_balances', 'lifetime_earned_ils', 'lifetime_earned_agorot');
SELECT public.fn_money_col_to_int('wallet_balances', 'lifetime_redeemed_ils', 'lifetime_redeemed_agorot');

-- wallet_transactions (006)
SELECT public.fn_money_col_to_int('wallet_transactions', 'amount_ils', 'amount_agorot');
SELECT public.fn_money_col_to_int('wallet_transactions', 'gross_amount_ils', 'gross_amount_agorot');

-- wallet_accounts + wallet_entries (046)
SELECT public.fn_money_col_to_int('wallet_accounts', 'balance_ils', 'balance_agorot');
SELECT public.fn_money_col_to_int('wallet_entries', 'amount_ils', 'amount_agorot');

-- products + product_variants (005)
SELECT public.fn_money_col_to_int('products', 'price_ils', 'price_agorot');
SELECT public.fn_money_col_to_int('products', 'compare_at_price_ils', 'compare_at_price_agorot');
SELECT public.fn_money_col_to_int('products', 'cost_ils', 'cost_agorot');
-- Binding model 2026-07-24: the admin-set absolute coupon price (added by 054)
-- converts like any other money column.
SELECT public.fn_money_col_to_int('products', 'coupon_price_ils', 'coupon_price_agorot');
SELECT public.fn_money_col_to_int('product_variants', 'price_ils', 'price_agorot');

-- coupon_redemptions (026)
SELECT public.fn_money_col_to_int('coupon_redemptions', 'amount_collected_ils', 'amount_collected_agorot');

-- 4. Percent columns: percent -> basis points (10% = 1000 bp) ----------------

-- products (026/046/047/042)
SELECT public.fn_money_col_to_int('products', 'platform_percent', 'platform_bp');
SELECT public.fn_money_col_to_int('products', 'commission_percent', 'commission_bp');
SELECT public.fn_money_col_to_int('products', 'cashback_percent', 'cashback_bp');

-- coupon_deals (026)
SELECT public.fn_money_col_to_int('coupon_deals', 'platform_percent', 'platform_bp');

-- order_items (007/026/046/047)
SELECT public.fn_money_col_to_int('order_items', 'platform_percent', 'platform_bp');
SELECT public.fn_money_col_to_int('order_items', 'commission_percent', 'commission_bp');
SELECT public.fn_money_col_to_int('order_items', 'cashback_percent', 'cashback_bp');
SELECT public.fn_money_col_to_int('order_items', 'upfront_percent', 'upfront_bp');
SELECT public.fn_money_col_to_int('order_items', 'commission_percent_snapshot', 'commission_snapshot_bp');

-- coupon_codes (046)
SELECT public.fn_money_col_to_int('coupon_codes', 'platform_percent', 'platform_bp');
SELECT public.fn_money_col_to_int('vouchers', 'platform_percent', 'platform_bp');

-- wallet_transactions (006)
SELECT public.fn_money_col_to_int('wallet_transactions', 'cashback_percent', 'cashback_bp');
SELECT public.fn_money_col_to_int('wallet_transactions', 'profit_share_cap_percent', 'profit_share_cap_bp');

-- vendors (001) + suppliers (027)
SELECT public.fn_money_col_to_int('vendors', 'commission_rate', 'commission_rate_bp');
SELECT public.fn_money_col_to_int('suppliers', 'commission_percent', 'commission_bp');

-- 5. Redefine the percent resolver over the new units ------------------------
-- 027's product_platform_percent read pr.platform_percent / s.commission_percent
-- which were just renamed. Keep its numeric-percent contract for existing
-- callers and add a bp-native variant for new code.

DO $$ BEGIN
  IF to_regclass('public.products') IS NOT NULL
     AND to_regclass('public.suppliers') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'platform_bp'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'supplier_id'
     ) THEN
    -- Same attributes as the 027 original (numeric return, SECURITY DEFINER)
    -- so CREATE OR REPLACE swaps the body in place.
    CREATE OR REPLACE FUNCTION public.product_platform_bp(p_product_id uuid)
    RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public AS
    'SELECT COALESCE(pr.platform_bp, s.commission_bp, 1000)
       FROM public.products pr
       LEFT JOIN public.suppliers s ON s.id = pr.supplier_id
      WHERE pr.id = p_product_id';

    CREATE OR REPLACE FUNCTION public.product_platform_percent(p_product_id uuid)
    RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public AS
    'SELECT (public.product_platform_bp(p_product_id))::numeric / 100.0';
  END IF;
END $$;

-- 6. Drop the helper (pure migration tool, not a runtime API) ----------------

DROP FUNCTION IF EXISTS public.fn_money_col_to_int(text, text, text, boolean);
