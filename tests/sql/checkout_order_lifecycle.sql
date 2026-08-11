-- Checkout order lifecycle harness (059 column cutover, migrations 086, 089).
--
--   docker exec -i supabase_db_kenyonexpress psql -U postgres -v ON_ERROR_STOP=1 \
--     < tests/sql/checkout_order_lifecycle.sql
--
-- WHY THIS EXISTS. Three separate failures had to be fixed on 2026-07-28 before
-- an order could be created and closed, and none of them was reachable from
-- vitest, because all three live in the database:
--
--   1. src/server/actions/payments/checkout.ts wrote orders and order_items
--      using column names 059 renamed, and omitted three NOT NULL agorot
--      columns entirely.
--   2. fn_snapshot_commission_ledger reads NEW.platform_percent, renamed to
--      platform_bp, so INSERT into order_items raised.
--   3. trg_orders_notification_events reads NEW.total_ils, renamed to
--      total_agorot, so the UPDATE moving an order to 'paid' raised - after the
--      customer had been charged.
--
-- The INSERT statements below are deliberately the same shape checkout.ts
-- writes. If someone changes the columns in one place and not the other, this
-- harness is what says so, rather than a customer's card.
--
-- Builds its own fixtures and rolls everything back.
--
-- What it covers:
--   1. an order row can be created with the post-059 money columns
--   2. an order line can be inserted, i.e. the commission trigger survives it
--   3. the commission ledger records the split in BASIS POINTS, not percent
--   4. the order can be moved to 'paid', i.e. the notification trigger survives
--   5. a paid order emits its notification with a correct amount
--   6. money still conserves across the line: fee + supplier due = paid online
--   7. a wallet credit lands and is visible in v_wallet_ledger

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_supplier  uuid := gen_random_uuid();
  v_product   uuid := gen_random_uuid();
  v_buyer     uuid := gen_random_uuid();
  v_order     uuid := gen_random_uuid();
  v_item      uuid := gen_random_uuid();
  v_ledger    public.commission_ledger%ROWTYPE;
  v_count     integer;
  v_status    text;
  v_agorot    integer;
  v_payload   jsonb;
  v_user_acct uuid;
  v_plat_acct uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_accounts'
      AND column_name = 'owner_type' AND is_nullable = 'NO'
  ) THEN
    EXECUTE $ddl$ALTER TABLE public.wallet_accounts ALTER COLUMN owner_type SET DEFAULT 'user'$ddl$;
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (v_buyer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          v_buyer::text || '@checkout.local', '', now(), now(), now());

  INSERT INTO public.profiles (id, email)
  VALUES (v_buyer, v_buyer::text || '@checkout.local')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.suppliers (id, name) VALUES (v_supplier, 'עסק תשלום');

  -- Physical product on a 15/85 split: the coupon path is covered by
  -- voucher_redemption_lifecycle.sql, this one is about the order itself.
  -- coupon_expiry_days is NOT NULL on products even for a physical row, so it
  -- is supplied here despite being meaningless for this product.
  INSERT INTO public.products
    (id, supplier_id, type, slug, name_he, price_agorot,
     platform_percent, supplier_split_percent, coupon_expiry_days)
  VALUES
    (v_product, v_supplier, 'physical', 'checkout-harness', 'מוצר בדיקה',
     20000, 15, 85, 90);

  -- ── 1. The order row, exactly as checkout.ts now writes it ────────────────
  INSERT INTO public.orders
    (id, user_id, status, subtotal_agorot, discount_agorot, wallet_applied_agorot,
     cashback_applied_agorot, customer_pays_now_agorot, total_agorot,
     currency, accepted_terms_at, expires_at)
  VALUES
    (v_order, v_buyer, 'pending', 20000, 0, 0, 0, 20000, 20000,
     'ILS', now(), now() + interval '30 minutes');

  SELECT count(*) INTO v_count FROM public.orders WHERE id = v_order;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the order row was not created';
  END IF;

  -- ── 2. The order line. This is what raised before 086 ─────────────────────
  -- 15% of 20000 agorot = 3000 to the platform, 17000 to the supplier.
  INSERT INTO public.order_items
    (id, order_id, product_id, product_type, supplier_id, quantity,
     unit_price_agorot, total_price_agorot, face_value_agorot,
     customer_pays_now_agorot, paid_on_site_agorot, charged_on_site_agorot,
     platform_fee_agorot, commission_agorot,
     supplier_due_agorot, supplier_immediate_agorot, supplier_payout_agorot,
     balance_due_agorot, balance_due_at_business_agorot,
     cashback_amount_agorot, cashback_earned_agorot,
     platform_bp, commission_bp, upfront_bp, commission_snapshot_bp, cashback_bp,
     supplier_split_percent, item_status, settlement_status)
  VALUES
    (v_item, v_order, v_product, 'physical', v_supplier, 1,
     20000, 20000, 20000,
     20000, 20000, 20000,
     3000, 3000,
     17000, 17000, 17000,
     0, 0,
     0, 0,
     1500, 1500, 1500, 1500, 0,
     85, 'pending', 'pending');

  -- ── 3. The ledger snapshot is in basis points ─────────────────────────────
  SELECT * INTO v_ledger FROM public.commission_ledger WHERE order_item_id = v_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the commission trigger wrote no ledger row';
  END IF;

  -- 15 percent is 1500 bps. Before 086 the trigger multiplied the column by 100
  -- on its way in; doing that to a column that already holds bps records
  -- 150000, i.e. a 1500 percent platform take, and nothing downstream notices
  -- because it is only ever read as a number.
  IF v_ledger.platform_percent_bps <> 1500 THEN
    RAISE EXCEPTION
      'the ledger recorded % bps for a 15 percent split, expected 1500',
      v_ledger.platform_percent_bps;
  END IF;
  IF v_ledger.platform_fee_agorot <> 3000 OR v_ledger.supplier_due_agorot <> 17000 THEN
    RAISE EXCEPTION 'the ledger split reads %/% agorot, expected 3000/17000',
      v_ledger.platform_fee_agorot, v_ledger.supplier_due_agorot;
  END IF;

  -- ── 6. Conservation on the line ──────────────────────────────────────────
  SELECT platform_fee_agorot + supplier_due_agorot INTO v_agorot
  FROM public.order_items WHERE id = v_item;
  IF v_agorot <> 20000 THEN
    RAISE EXCEPTION
      'fee + supplier due = % agorot but the customer paid 20000', v_agorot;
  END IF;

  -- ── 4. The flip to paid. This is what raised before 086 ──────────────────
  UPDATE public.orders
  SET status = 'paid'::public.order_status, paid_at = now()
  WHERE id = v_order;

  SELECT status::text INTO v_status FROM public.orders WHERE id = v_order;
  IF v_status <> 'paid' THEN
    RAISE EXCEPTION 'the order did not reach paid (status %)', v_status;
  END IF;

  -- ── 5. The notification carries a real amount ────────────────────────────
  SELECT payload INTO v_payload
  FROM public.notification_events
  WHERE dedupe_key = 'order_paid:' || v_order::text;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'no order_paid notification was emitted';
  END IF;
  IF (v_payload->>'total_agorot')::integer <> 20000 THEN
    RAISE EXCEPTION 'the notification says % agorot, expected 20000',
      v_payload->>'total_agorot';
  END IF;
  -- The shekel key is what existing templates read; a blank there is a blank in
  -- a customer's email.
  IF (v_payload->>'total_ils')::numeric <> 200.00 THEN
    RAISE EXCEPTION 'the notification says % ILS, expected 200.00',
      v_payload->>'total_ils';
  END IF;

  -- ── 7. A wallet credit lands and is readable ─────────────────────────────
  SELECT id INTO v_user_acct FROM public.wallet_accounts WHERE user_id = v_buyer;
  IF v_user_acct IS NULL THEN
    INSERT INTO public.wallet_accounts (owner_type, user_id, balance_agorot)
    VALUES ('user', v_buyer, 0) RETURNING id INTO v_user_acct;
  END IF;

  SELECT id INTO v_plat_acct FROM public.wallet_accounts WHERE code = 'platform:adjustments';
  IF v_plat_acct IS NULL THEN
    RAISE EXCEPTION 'fixture: platform:adjustments wallet account is missing';
  END IF;

  PERFORM public.fn_wallet_transfer(
    v_plat_acct, v_user_acct, 12.34, 'cashback',
    'harness:' || v_order::text || ':cashback', v_order);

  SELECT balance_agorot INTO v_agorot FROM public.wallet_accounts WHERE id = v_user_acct;
  IF v_agorot <> 1234 THEN
    RAISE EXCEPTION 'the wallet holds % agorot after a 12.34 credit, expected 1234', v_agorot;
  END IF;

  -- The view is what the customer's account page renders. Before 090 it read
  -- the frozen legacy column, so a credit that had certainly happened simply
  -- did not appear.
  SELECT amount_agorot INTO v_agorot
  FROM public.v_wallet_ledger
  WHERE user_id = v_buyer AND order_id = v_order AND direction = 'credit';
  IF v_agorot IS DISTINCT FROM 1234 THEN
    RAISE EXCEPTION 'v_wallet_ledger shows % agorot, expected 1234', v_agorot;
  END IF;

  RAISE NOTICE 'checkout order lifecycle: all assertions passed';
END $$;

ROLLBACK;
