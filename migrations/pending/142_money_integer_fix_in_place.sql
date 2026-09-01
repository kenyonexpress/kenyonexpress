-- ============================================================================
-- PENDING: money columns from numeric ILS to integer agorot
-- ============================================================================
--
-- NOT FOR EXECUTION. Superseded by the additive approach in 138-141.
-- Retained as the written specification of the eventual in-place end state.
-- Do not apply.
--
-- STATUS: NOT APPLIED. Awaiting Ofir's explicit approval.
-- Apply ONLY through MCP apply_migration, never db push. The filename
-- deliberately breaks the NNN_ prefix convention so no tooling picks it up
-- as part of the ordered chain.
--
-- WHY THIS EXISTS
-- The audit of 2026-08-02 found the production database keeps money in
-- numeric(N,2) ILS while the entire application layer is built on integer
-- agorot (src/lib/commerce/money.ts, D-MONEY-1). Every boundary crossing is
-- a float conversion, and this codebase has already paid for that twice:
-- the cart's silent /100+x100 pair (fixed 2026-07-31, commit 2b8d9f8) and
-- the checkout wallet cap that compared shekels to agorot. The audit
-- request named 32 columns; the actual sweep of information_schema found
-- 41 convertible money columns, 1 dual-unit column that CANNOT be blindly
-- converted, and 22 rate columns that are not money at all. All listed
-- below, none guessed.
--
-- ============================================================================
-- THE DEPLOY CONTRACT: THIS FILE IS HALF OF ONE CHANGE
-- ============================================================================
--
-- 52 application files read the old column names as ILS (grep run
-- 2026-08-02: "_ils|kenyon_price" outside tests and generated types).
-- Applying this migration without the paired code deploy multiplies every
-- price on the site by 100. That is not a risk, it is a certainty. The
-- non-negotiable order:
--
--   1. Land the code branch that reads *_agorot names (not written yet).
--   2. Put the site in maintenance or a deploy freeze window.
--   3. apply_migration with this file.
--   4. Deploy the code from step 1.
--   5. Run every query in the VERIFICATION section below.
--   6. Regenerate src/types/database.ts.
--
-- Three readers need NO code change because they already resolve the column
-- name at runtime and prefer the agorot spelling this migration creates:
--   - src/lib/payments/payment-money-columns.ts   (payments.amount_agorot)
--   - the wallet balance probe from GOAL [5]      (wallet_accounts.balance_agorot)
--   - tg_orders_notify_paid                       (orders.total_agorot,
--     order_items.total_price_agorot, with *100 fallback while unapplied)
-- Their target names are therefore FIXED, and this file uses exactly those.
--
-- ============================================================================
-- EXCLUDED, WITH REASONS (do not "complete" this list without reading)
-- ============================================================================
--
-- coupons.discount_value: DUAL-UNIT. Holds shekels when discount_type is
--   'fixed' and a percentage when it is 'percent'/'percentage'
--   (src/lib/cart/coupon.ts:10-12 documents this and branches on it).
--   A blanket x100 corrupts the percent branch; a conditional x100 leaves
--   one column in two units forever. The correct fix is a schema split
--   (discount_percent_bp integer + discount_agorot bigint) plus a backfill
--   branching on discount_type, and that is a separate decision. The table
--   has 0 rows today, so the split costs nothing when approved.
--
-- 22 rate columns (products.platform_percent, order_items.commission_percent,
--   order_items.*_percent*, suppliers.commission_percent,
--   suppliers.default_split_percent, coupon_codes.platform_percent,
--   coupon_deals.discount_percentage, cashback_rules.percent,
--   settlement_events.*_snapshot, vendors.commission_rate,
--   vouchers.platform_percent, wallet_transactions.*_percent,
--   products.cashback_percent, products.discount_percent,
--   products.supplier_split_percent, products.profit_share_cap_percent,
--   products.commission_percent):
--   These are RATES, not amounts. The application contract is whole percent
--   end to end, converted once at the engine boundary by
--   percentToBasisPoints() (src/lib/commerce/money.ts). "commission_percent
--   is money" in the audit request is a category error: multiplying a
--   percent by 100 produces basis points, not agorot, and every reader of
--   these columns expects whole percent. Moving them to integer bp is a
--   defensible but separate migration with its own 22-column code sweep.
--
-- products.length_cm, width_cm, height_cm: dimensions, not money.
--
-- suppliers.min_payout_ils: does not exist as numeric in this database
--   (the sweep found only the two rate columns on suppliers). Listed here
--   because docs/ARCHITECTURE-SUPPLIER-PORTAL.md mentions it; the document
--   describes a column production does not have.
--
-- ============================================================================
-- PRE-FLIGHT (run manually BEFORE applying; all four must come back clean)
-- ============================================================================
--
-- 1. No check constraint on the affected tables embeds an ILS literal that
--    would silently change meaning under x100:
--
--      SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
--      FROM pg_constraint
--      WHERE contype = 'c'
--        AND conrelid::regclass::text IN
--          ('affiliates','cashback_rules','coupon_codes','coupon_deals',
--           'coupons','order_items','orders','payments','product_variants',
--           'products','profiles','referrals','wallet_accounts',
--           'wallet_balances','wallet_entries','wallet_transactions')
--        AND pg_get_constraintdef(oid) ~ '[0-9]';
--
--    (Verified 2026-08-02: the money checks compare columns to columns or
--    to zero; both survive a linear scale. Re-run anyway: constraints move.)
--
-- 2. No unexpected dependent views beyond the two rewritten here:
--    re-run the pg_depend query from the audit. Verified 2026-08-02:
--    v_wallet_ledger and v_wallet_balance_drift only.
--
-- 3. Row counts are small enough for in-place UPDATE (verified 2026-08-02:
--    largest affected table is products at 61 rows; no batching needed).
--
-- 4. supabase/migrations on disk is NOT the lineage of this database
--    (memory: hosted DB is pre-059). Nothing here references the file
--    chain; every guard probes the live catalog.
--
-- ============================================================================
-- CONVERSION RULES
-- ============================================================================
--
-- Type: bigint. numeric(12,2) can hold 10^10 ILS = 10^12 agorot, past
--   int4's 2.1e9. int8 also matches what the runtime-probing readers and
--   tg_orders_notify_paid already cast to (::bigint).
-- Value: round(old * 100). Scale is (N,2) everywhere, so this is exact;
--   round() guards against any legacy value written with more precision.
-- Names: X_ils -> X_agorot. Bare names gain _agorot. Where a table carries
--   BOTH spellings of the same price (products.compare_at_price_ils and
--   products.compare_at_price; product_variants.price_ils and .price), the
--   column the application reads keeps the clean name and the duplicate
--   becomes *_legacy_agorot, flagged for a later DROP once confirmed dead:
--     product_variants.price      -> price_agorot        (read by pricing.ts)
--     product_variants.price_ils  -> price_legacy_agorot (read by nothing found)
--     products.compare_at_price_ils -> compare_at_price_agorot
--     products.compare_at_price     -> compare_at_price_legacy_agorot
-- Idempotency: every conversion runs only if the OLD name still exists and
--   the NEW one does not, so a rerun after a partial failure continues where
--   it stopped and a completed run is a no-op.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Views first: they block ALTER COLUMN TYPE on wallet tables.
--    Recreated in section 4 with agorot names.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_wallet_balance_drift;
DROP VIEW IF EXISTS public.v_wallet_ledger;

-- ----------------------------------------------------------------------------
-- 1. The rename+convert worker.
--    SECURITY: identifiers are passed through format('%I'); executed only
--    against the fixed list below, never user input.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.convert_money_column(
  p_table text, p_old text, p_new text, p_keep_default boolean
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_old
     )
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_new
     )
  THEN
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', p_table, p_old, p_new);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT', p_table, p_new);
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE bigint USING round(%I * 100)::bigint',
      p_table, p_new, p_new
    );
    IF p_keep_default THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT 0', p_table, p_new);
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. The 41 conversions. p_keep_default mirrors the current DEFAULT 0.
-- ----------------------------------------------------------------------------

SELECT pg_temp.convert_money_column('affiliates',          'total_earnings_ils',    'total_earnings_agorot',    true);

SELECT pg_temp.convert_money_column('cashback_rules',      'min_order_ils',         'min_order_agorot',         true);
SELECT pg_temp.convert_money_column('cashback_rules',      'max_cashback_ils',      'max_cashback_agorot',      false);

SELECT pg_temp.convert_money_column('coupon_codes',        'face_value_ils',        'face_value_agorot',        true);
SELECT pg_temp.convert_money_column('coupon_codes',        'platform_paid_ils',     'platform_paid_agorot',     true);
SELECT pg_temp.convert_money_column('coupon_codes',        'collect_amount_ils',    'collect_amount_agorot',    true);

SELECT pg_temp.convert_money_column('coupon_deals',        'original_price',        'original_price_agorot',    false);
SELECT pg_temp.convert_money_column('coupon_deals',        'platform_price',        'platform_price_agorot',    false);

SELECT pg_temp.convert_money_column('coupons',             'original_price',        'original_price_agorot',    false);
SELECT pg_temp.convert_money_column('coupons',             'min_purchase',          'min_purchase_agorot',      true);

SELECT pg_temp.convert_money_column('order_items',         'unit_price_ils',        'unit_price_agorot',        false);
SELECT pg_temp.convert_money_column('order_items',         'total_price_ils',       'total_price_agorot',       false);
SELECT pg_temp.convert_money_column('order_items',         'supplier_payout_ils',   'supplier_payout_agorot',   false);
SELECT pg_temp.convert_money_column('order_items',         'cashback_earned_ils',   'cashback_earned_agorot',   true);
SELECT pg_temp.convert_money_column('order_items',         'coupon_price_ils',      'coupon_price_agorot',      false);

SELECT pg_temp.convert_money_column('orders',              'subtotal_ils',          'subtotal_agorot',          false);
SELECT pg_temp.convert_money_column('orders',              'discount_ils',          'discount_agorot',          true);
SELECT pg_temp.convert_money_column('orders',              'cashback_applied_ils',  'cashback_applied_agorot',  true);
SELECT pg_temp.convert_money_column('orders',              'total_ils',             'total_agorot',             false);

SELECT pg_temp.convert_money_column('payments',            'amount_ils',            'amount_agorot',            false);
SELECT pg_temp.convert_money_column('payments',            'wallet_applied_ils',    'wallet_applied_agorot',    true);

SELECT pg_temp.convert_money_column('product_variants',    'price',                 'price_agorot',             false);
SELECT pg_temp.convert_money_column('product_variants',    'price_ils',             'price_legacy_agorot',      false);
SELECT pg_temp.convert_money_column('product_variants',    'price_modifier',        'price_modifier_agorot',    true);

SELECT pg_temp.convert_money_column('products',            'price_ils',             'price_agorot',             false);
SELECT pg_temp.convert_money_column('products',            'compare_at_price_ils',  'compare_at_price_agorot',  false);
SELECT pg_temp.convert_money_column('products',            'compare_at_price',      'compare_at_price_legacy_agorot', false);
SELECT pg_temp.convert_money_column('products',            'cost_ils',              'cost_agorot',              false);
SELECT pg_temp.convert_money_column('products',            'kenyon_price',          'kenyon_price_agorot',      false);
SELECT pg_temp.convert_money_column('products',            'full_price',            'full_price_agorot',        false);
SELECT pg_temp.convert_money_column('products',            'min_purchase_ils',      'min_purchase_agorot',      false);
SELECT pg_temp.convert_money_column('products',            'coupon_price_ils',      'coupon_price_agorot',      false);

SELECT pg_temp.convert_money_column('profiles',            'wallet_balance',        'wallet_balance_agorot',    true);

SELECT pg_temp.convert_money_column('referrals',           'bonus_paid_amount_ils', 'bonus_paid_amount_agorot', true);

SELECT pg_temp.convert_money_column('wallet_accounts',     'balance_ils',           'balance_agorot',           true);

SELECT pg_temp.convert_money_column('wallet_balances',     'balance_ils',           'balance_agorot',           true);
SELECT pg_temp.convert_money_column('wallet_balances',     'lifetime_earned_ils',   'lifetime_earned_agorot',   true);
SELECT pg_temp.convert_money_column('wallet_balances',     'lifetime_redeemed_ils', 'lifetime_redeemed_agorot', true);

SELECT pg_temp.convert_money_column('wallet_entries',      'amount_ils',            'amount_agorot',            false);

SELECT pg_temp.convert_money_column('wallet_transactions', 'amount_ils',            'amount_agorot',            false);
SELECT pg_temp.convert_money_column('wallet_transactions', 'gross_amount_ils',      'gross_amount_agorot',      false);

DROP FUNCTION IF EXISTS pg_temp.convert_money_column(text, text, text, boolean);

-- ----------------------------------------------------------------------------
-- 3. Functions whose bodies or signatures carry ILS.
--    Signature changes need DROP: CREATE OR REPLACE cannot rename an arg.
-- ----------------------------------------------------------------------------

-- 3a. fn_wallet_transfer: p_amount_ils numeric -> p_amount_agorot bigint.
--     Body identical in structure; only the unit and column names change.
--     The GRANT below restores the service_role-only surface GOAL [5]
--     verified; without it a recreated SECURITY DEFINER function is
--     PUBLIC-executable, which is a client-side money-moving hole.

DROP FUNCTION IF EXISTS public.fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid);

CREATE OR REPLACE FUNCTION public.fn_wallet_transfer(
  p_debit_account uuid, p_credit_account uuid, p_amount_agorot bigint,
  p_reason text, p_idempotency text, p_order_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_debit public.wallet_accounts%ROWTYPE;
  v_entry uuid;
BEGIN
  IF p_amount_agorot IS NULL OR p_amount_agorot <= 0 THEN
    RAISE EXCEPTION 'transfer amount must be positive';
  END IF;
  IF p_debit_account = p_credit_account THEN
    RAISE EXCEPTION 'transfer accounts must differ';
  END IF;

  SELECT id INTO v_existing FROM public.wallet_entries WHERE idempotency_key = p_idempotency;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  PERFORM 1 FROM public.wallet_accounts
   WHERE id IN (p_debit_account, p_credit_account)
   ORDER BY id FOR UPDATE;

  SELECT * INTO v_debit FROM public.wallet_accounts WHERE id = p_debit_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'debit account not found';
  END IF;
  IF v_debit.user_id IS NOT NULL AND v_debit.balance_agorot < p_amount_agorot THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  UPDATE public.wallet_accounts SET balance_agorot = balance_agorot - p_amount_agorot
   WHERE id = p_debit_account;
  UPDATE public.wallet_accounts SET balance_agorot = balance_agorot + p_amount_agorot
   WHERE id = p_credit_account;

  INSERT INTO public.wallet_entries
    (debit_account, credit_account, amount_agorot, reason, idempotency_key, order_id)
  VALUES
    (p_debit_account, p_credit_account, p_amount_agorot, p_reason, p_idempotency, p_order_id)
  RETURNING id INTO v_entry;

  RETURN v_entry;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, bigint, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, bigint, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, bigint, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer(uuid, uuid, bigint, text, text, uuid) TO service_role;

-- 3b. fn_pay_referral: same signature; stops dividing agorot back to ILS
--     when calling the transfer, and writes the renamed bonus column.

CREATE OR REPLACE FUNCTION public.fn_pay_referral(p_referral_id uuid, p_approved_by uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ref public.referrals%rowtype; v_reserve uuid; v_acct uuid;
BEGIN
  SELECT * INTO v_ref FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_ref.status = 'completed' THEN RETURN jsonb_build_object('ok', true, 'reason', 'already_paid'); END IF;
  IF v_ref.status = 'rejected'  THEN RETURN jsonb_build_object('ok', false, 'reason', 'rejected'); END IF;

  SELECT id INTO v_reserve FROM public.wallet_accounts WHERE code = 'platform:cashback_reserve';
  IF v_reserve IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_reserve_account'); END IF;

  IF COALESCE(v_ref.referrer_bonus_agorot, 0) > 0 THEN
    SELECT id INTO v_acct FROM public.wallet_accounts WHERE user_id = v_ref.referrer_user_id;
    IF v_acct IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer_wallet'); END IF;
    PERFORM public.fn_wallet_transfer(v_reserve, v_acct,
      v_ref.referrer_bonus_agorot::bigint, 'referral_bonus',
      'referral:' || v_ref.id::text || ':referrer', v_ref.referred_first_order_id);
  END IF;

  IF COALESCE(v_ref.referred_bonus_agorot, 0) > 0 THEN
    SELECT id INTO v_acct FROM public.wallet_accounts WHERE user_id = v_ref.referred_user_id;
    IF v_acct IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referred_wallet'); END IF;
    PERFORM public.fn_wallet_transfer(v_reserve, v_acct,
      v_ref.referred_bonus_agorot::bigint, 'referral_bonus',
      'referral:' || v_ref.id::text || ':referred', v_ref.referred_first_order_id);
  END IF;

  UPDATE public.referrals
     SET status = 'completed', completed_at = now(), paid_at = now(),
         reviewed_by = COALESCE(p_approved_by, reviewed_by),
         reviewed_at = CASE WHEN p_approved_by IS NOT NULL THEN now() ELSE reviewed_at END,
         bonus_paid_amount_agorot =
           (COALESCE(v_ref.referrer_bonus_agorot,0) + COALESCE(v_ref.referred_bonus_agorot,0))::bigint,
         updated_at = now()
   WHERE id = v_ref.id;

  RETURN jsonb_build_object('ok', true, 'reason', 'paid');
END; $function$;

-- 3c. Cashback pair: ILS params out, agorot in. The percent variant only
--     READ an ILS threshold; its signature still names ILS, so both are
--     dropped and recreated on agorot to keep one unit end to end.
--     round() on the amount happens on the agora, matching money.ts.

DROP FUNCTION IF EXISTS public.fn_wallet_cashback_amount(uuid, numeric, uuid[]);
DROP FUNCTION IF EXISTS public.fn_wallet_cashback_percent(uuid, numeric, uuid[]);

CREATE OR REPLACE FUNCTION public.fn_wallet_cashback_percent(
  p_user_id uuid, p_order_total_agorot bigint, p_category_ids uuid[] DEFAULT NULL::uuid[]
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_paid_orders integer;
  v_percent     numeric;
BEGIN
  IF p_user_id IS NULL OR p_order_total_agorot IS NULL OR p_order_total_agorot <= 0 THEN
    RETURN 0;
  END IF;

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
    AND p_order_total_agorot >= r.min_order_agorot
    AND (r.every_nth_order IS NULL OR (v_paid_orders > 0 AND v_paid_orders % r.every_nth_order = 0))
    AND (r.category_id IS NULL OR (p_category_ids IS NOT NULL AND r.category_id = ANY (p_category_ids)))
  ORDER BY r.priority, r.id
  LIMIT 1;

  RETURN COALESCE(v_percent, 0);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_wallet_cashback_amount(
  p_user_id uuid, p_order_total_agorot bigint, p_category_ids uuid[] DEFAULT NULL::uuid[]
) RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_paid_orders integer;
  v_percent     numeric;
  v_cap         bigint;
  v_amount      bigint;
BEGIN
  IF p_user_id IS NULL OR p_order_total_agorot IS NULL OR p_order_total_agorot <= 0 THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_paid_orders
  FROM public.orders
  WHERE user_id = p_user_id
    AND paid_at IS NOT NULL
    AND deleted_at IS NULL;

  SELECT r.percent, r.max_cashback_agorot INTO v_percent, v_cap
  FROM public.cashback_rules r
  WHERE r.is_active
    AND (r.starts_at IS NULL OR r.starts_at <= now())
    AND (r.ends_at   IS NULL OR r.ends_at   >  now())
    AND p_order_total_agorot >= r.min_order_agorot
    AND (r.every_nth_order IS NULL OR (v_paid_orders > 0 AND v_paid_orders % r.every_nth_order = 0))
    AND (r.category_id IS NULL OR (p_category_ids IS NOT NULL AND r.category_id = ANY (p_category_ids)))
  ORDER BY r.priority, r.id
  LIMIT 1;

  IF v_percent IS NULL THEN
    RETURN 0;
  END IF;

  v_amount := round(p_order_total_agorot * v_percent / 100.0)::bigint;
  IF v_cap IS NOT NULL AND v_amount > v_cap THEN
    v_amount := v_cap;
  END IF;

  RETURN v_amount;
END $function$;

-- NOT recreated, with reasons:
--   tg_orders_notify_paid: already agorot-first with an ILS fallback;
--     after the rename the fallback branch is simply dead. Leave as is.
--   fn_claim_discount: touches only discount_campaigns/discount_redemptions,
--     which are already integer agorot. The audit's ILIKE match was its
--     amount_agorot identifiers, not an ILS read.
--   product_platform_percent: reads a rate column, excluded above.

-- ----------------------------------------------------------------------------
-- 4. The two views, back, in agorot.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_wallet_ledger AS
 SELECT e.id,
    a.user_id,
        CASE
            WHEN e.credit_account = a.id THEN 'credit'::text
            ELSE 'debit'::text
        END AS direction,
        CASE
            WHEN e.credit_account = a.id THEN e.amount_agorot
            ELSE - e.amount_agorot
        END AS signed_amount_agorot,
    e.amount_agorot,
    e.reason,
    e.order_id,
    e.created_at
   FROM public.wallet_entries e
     JOIN public.wallet_accounts a ON a.id = e.debit_account OR a.id = e.credit_account
  WHERE a.user_id IS NOT NULL;

CREATE OR REPLACE VIEW public.v_wallet_balance_drift AS
 SELECT a.id AS account_id,
    a.user_id,
    a.code,
    a.balance_agorot AS cached_balance_agorot,
    COALESCE(sum(
        CASE
            WHEN e.credit_account = a.id THEN e.amount_agorot
            WHEN e.debit_account = a.id THEN - e.amount_agorot
            ELSE NULL::bigint
        END), 0::bigint) AS ledger_balance_agorot,
    a.balance_agorot - COALESCE(sum(
        CASE
            WHEN e.credit_account = a.id THEN e.amount_agorot
            WHEN e.debit_account = a.id THEN - e.amount_agorot
            ELSE NULL::bigint
        END), 0::bigint) AS drift_agorot
   FROM public.wallet_accounts a
     LEFT JOIN public.wallet_entries e ON a.id = e.debit_account OR a.id = e.credit_account
  GROUP BY a.id, a.user_id, a.code, a.balance_agorot
 HAVING a.balance_agorot <> COALESCE(sum(
        CASE
            WHEN e.credit_account = a.id THEN e.amount_agorot
            WHEN e.debit_account = a.id THEN - e.amount_agorot
            ELSE NULL::bigint
        END), 0::bigint);

-- ============================================================================
-- VERIFICATION (run every one after applying; expected results inline)
-- ============================================================================
--
-- 1. No numeric money column survives (expect 0 rows; the 22 rate columns,
--    coupons.discount_value and the three *_cm dimensions are the allowed
--    remainder and are filtered out here):
--
--      SELECT table_name, column_name FROM information_schema.columns
--      WHERE table_schema='public' AND data_type='numeric'
--        AND column_name NOT ILIKE '%percent%'
--        AND column_name NOT IN ('discount_value','commission_rate','percent',
--                                'discount_percentage','length_cm','width_cm',
--                                'height_cm');
--
-- 2. Values scaled, not shifted (spot check against the pre-apply snapshot;
--    take the snapshot BEFORE applying):
--
--      SELECT id, kenyon_price_agorot FROM products ORDER BY id LIMIT 5;
--      -- each value must be exactly 100x its pre-apply kenyon_price.
--
-- 3. The ledger still balances (expect 0 rows):
--
--      SELECT * FROM public.v_wallet_balance_drift;
--
-- 4. The webhook trigger resolves the agorot branch: pay a test order and
--    confirm notification_outbox holds total_agorot equal to the payment.
--
-- 5. fn_wallet_transfer surface (expect exactly one row, service_role):
--
--      SELECT grantee, privilege_type
--      FROM information_schema.routine_privileges
--      WHERE routine_name='fn_wallet_transfer';
--
-- ============================================================================
