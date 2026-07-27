-- Voucher visibility harness: who may read what, from the account area.
--
-- `/account/vouchers` and `/account/orders` read through the user's own client,
-- so RLS is the only thing standing between one customer and another's coupon
-- codes. A leaked `qr_payload` is a spendable voucher, not merely a privacy
-- problem, which is why this is asserted rather than assumed.
--
--   docker exec -i supabase_db_kenyonexpress psql -U postgres -v ON_ERROR_STOP=1 \
--     < tests/sql/voucher_account_rls.sql
--
-- Builds its own fixtures and rolls back. Requires 073, 074 and their deps.
--
-- What it covers:
--   1. the buyer sees their own vouchers, and only those
--   2. a stranger sees none of them
--   3. a supplier member sees the supplier's REDEEMED vouchers, never an
--      unredeemed one (the code is still spendable until it is scanned)
--   4. nobody but the owner reads the escrow hold or the payment behind it
--   5. no customer can write a voucher: not insert, not update, not delete

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_supplier   uuid := gen_random_uuid();
  v_product    uuid := gen_random_uuid();
  v_buyer      uuid := gen_random_uuid();
  v_stranger   uuid := gen_random_uuid();
  v_scanner    uuid := gen_random_uuid();
  v_order      uuid := gen_random_uuid();
  v_item       uuid := gen_random_uuid();
  v_open       uuid := gen_random_uuid();
  v_done       uuid := gen_random_uuid();
  v_count      integer;
BEGIN
  -- See the note in voucher_redemption_lifecycle.sql: some dev databases carry
  -- wallet_accounts.owner_type NOT NULL, which the profile trigger does not
  -- fill. Neutralised for this transaction only.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_accounts'
      AND column_name = 'owner_type' AND is_nullable = 'NO'
  ) THEN
    EXECUTE $ddl$ALTER TABLE public.wallet_accounts ALTER COLUMN owner_type SET DEFAULT 'user'$ddl$;
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u::text || '@rls.local', '', now(), now(), now()
  FROM unnest(ARRAY[v_buyer, v_stranger, v_scanner]) AS u;

  INSERT INTO public.profiles (id, email)
  SELECT u, u::text || '@rls.local' FROM unnest(ARRAY[v_buyer, v_stranger, v_scanner]) AS u
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.suppliers (id, name) VALUES (v_supplier, 'עסק RLS');
  INSERT INTO public.supplier_members (supplier_id, user_id, is_active)
  VALUES (v_supplier, v_scanner, true);

  INSERT INTO public.products
    (id, supplier_id, type, slug, name_he, price_ils, platform_percent,
     coupon_expiry_days, commission_percent, coupon_price_ils)
  VALUES (v_product, v_supplier, 'coupon', 'rls-coupon', 'קופון RLS',
          100, 30, 90, 30, 50);

  INSERT INTO public.orders
    (id, user_id, status, subtotal_ils, total_ils, subtotal_agorot,
     customer_pays_now_agorot, paid_at)
  VALUES (v_order, v_buyer, 'paid', 50, 50, 5000, 5000, now());

  INSERT INTO public.order_items
    (id, order_id, product_id, product_type, supplier_id, quantity,
     unit_price_ils, total_price_ils, commission_percent, supplier_payout_ils,
     unit_price_agorot, face_value_agorot, customer_pays_now_agorot,
     platform_fee_agorot, supplier_due_agorot, cashback_percent,
     cashback_amount_agorot, platform_percent, settlement_status, item_status)
  VALUES (v_item, v_order, v_product, 'coupon', v_supplier, 2,
          100, 200, 30, 70, 10000, 20000, 10000, 3000, 7000, 0, 0, 30,
          'escrow_held', 'issued');

  -- One still spendable, one already scanned.
  INSERT INTO public.vouchers
    (id, code, qr_payload, order_id, order_item_id, product_id, supplier_id,
     user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
     platform_percent, status, offer_valid_until, expires_at)
  VALUES
    (v_open, 'RSVPAAAA01', 'qr-open', v_order, v_item, v_product, v_supplier,
     v_buyer, 10000, 5000, 5000, 30, 'issued',
     now() + interval '30 days', now() + interval '30 days');

  INSERT INTO public.vouchers
    (id, code, qr_payload, order_id, order_item_id, product_id, supplier_id,
     user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
     platform_percent, status, offer_valid_until, expires_at,
     redeemed_at, redeemed_by_supplier_id, redeemed_by_user_id)
  VALUES
    (v_done, 'RSVPAAAA02', 'qr-done', v_order, v_item, v_product, v_supplier,
     v_buyer, 10000, 5000, 5000, 30, 'redeemed',
     now() + interval '30 days', now() + interval '30 days',
     now(), v_supplier, v_scanner);

  INSERT INTO public.escrow_holds
    (voucher_id, order_id, order_item_id, supplier_id,
     held_agorot, commission_agorot, release_agorot, status)
  VALUES (v_open, v_order, v_item, v_supplier, 5000, 1500, 3500, 'held');

  -- ── 1. The buyer sees exactly their own two ───────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.vouchers WHERE order_id = v_order;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'the buyer sees % of their own 2 vouchers', v_count;
  END IF;

  -- ── 2. A stranger sees nothing ────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.vouchers WHERE order_id = v_order;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: a stranger reads % of another customer''s vouchers', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.orders WHERE id = v_order;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: a stranger reads another customer''s order';
  END IF;

  -- ── 3. The supplier sees the scanned one only ─────────────────────────────
  -- An unredeemed code is still spendable; the business has no business
  -- reading it before it is presented at the counter.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_scanner, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.vouchers WHERE id = v_done;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the supplier cannot read a voucher it redeemed (% rows)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.vouchers WHERE id = v_open;
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'SECURITY: the supplier reads an unredeemed voucher code (% rows)', v_count;
  END IF;

  -- The supplier CAN read the paid order carrying their line. This is the
  -- positive half of the 077 fix: before it, this same read raised 42P17
  -- rather than returning a row, and it did so for every reader on the table.
  -- Skipped where orders_supplier_read does not exist (the hosted project
  -- never received 027 in full, so suppliers have no order read there).
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.orders'::regclass AND polname = 'orders_supplier_read'
  ) THEN
    SELECT count(*) INTO v_count FROM public.orders WHERE id = v_order;
    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'the supplier cannot read the paid order holding their line (% rows)', v_count;
    END IF;
  END IF;

  -- ── 4. Money rows follow the owner, not the reader ────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.escrow_holds WHERE voucher_id = v_open;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: a stranger reads an escrow hold (% rows)', v_count;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.escrow_holds WHERE voucher_id = v_open;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the buyer cannot read the hold on their own order (% rows)', v_count;
  END IF;

  -- ── 5. Vouchers are read-only to every customer ───────────────────────────
  -- The owner policy is SELECT only. A customer who could UPDATE could flip a
  -- redeemed voucher back to issued and spend it twice.
  BEGIN
    UPDATE public.vouchers SET status = 'issued' WHERE id = v_done;
    IF FOUND THEN
      RAISE EXCEPTION 'SECURITY: the owner un-redeemed their own voucher';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE '%SECURITY:%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.vouchers WHERE id = v_done;
    IF FOUND THEN
      RAISE EXCEPTION 'SECURITY: the owner deleted a voucher';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE '%SECURITY:%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.vouchers
      (code, qr_payload, order_id, order_item_id, product_id, supplier_id,
       user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
       platform_percent, status, offer_valid_until, expires_at)
    VALUES
      ('RSVPAAAA03', 'qr-mint', v_order, v_item, v_product, v_supplier,
       v_buyer, 10000, 0, 10000, 30, 'issued',
       now() + interval '30 days', now() + interval '30 days');
    RAISE EXCEPTION 'SECURITY: a customer minted themselves a voucher';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE '%SECURITY:%' THEN RAISE; END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'voucher account RLS: all assertions passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Supplier scoping (migration 078).
--
-- The grant is "orders containing your own products, and nothing else". These
-- are the three ways that can go wrong: seeing a co-supplier's line, seeing an
-- order you are not on, and being handed a customer's address when you have
-- nothing to ship.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_sup_a      uuid := gen_random_uuid();  -- physical goods
  v_sup_b      uuid := gen_random_uuid();  -- coupons only
  v_prod_a     uuid := gen_random_uuid();
  v_prod_b     uuid := gen_random_uuid();
  v_buyer      uuid := gen_random_uuid();
  v_staff_a    uuid := gen_random_uuid();
  v_staff_b    uuid := gen_random_uuid();
  v_address    uuid := gen_random_uuid();
  v_order      uuid := gen_random_uuid();  -- shared: one line each
  v_solo       uuid := gen_random_uuid();  -- supplier A only
  v_item_a     uuid := gen_random_uuid();
  v_item_b     uuid := gen_random_uuid();
  v_count      integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.orders'::regclass AND polname = 'orders_supplier_read'
  ) THEN
    RAISE NOTICE 'supplier scoping: skipped, 078 not applied here';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_accounts'
      AND column_name = 'owner_type' AND is_nullable = 'NO'
  ) THEN
    EXECUTE $ddl$ALTER TABLE public.wallet_accounts ALTER COLUMN owner_type SET DEFAULT 'user'$ddl$;
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u::text || '@scope.local', '', now(), now(), now()
  FROM unnest(ARRAY[v_buyer, v_staff_a, v_staff_b]) AS u;

  INSERT INTO public.profiles (id, email)
  SELECT u, u::text || '@scope.local' FROM unnest(ARRAY[v_buyer, v_staff_a, v_staff_b]) AS u
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.suppliers (id, name) VALUES
    (v_sup_a, 'ספק פיזי'), (v_sup_b, 'ספק קופונים');
  INSERT INTO public.supplier_members (supplier_id, user_id, is_active) VALUES
    (v_sup_a, v_staff_a, true), (v_sup_b, v_staff_b, true);

  INSERT INTO public.products
    (id, supplier_id, type, slug, name_he, price_ils, platform_percent,
     coupon_expiry_days, commission_percent, coupon_price_ils)
  VALUES
    (v_prod_a, v_sup_a, 'physical', 'scope-physical', 'מוצר פיזי', 100, 15, 90, 15, NULL),
    (v_prod_b, v_sup_b, 'coupon',   'scope-coupon',   'קופון',     100, 30, 90, 30, 50);

  INSERT INTO public.user_addresses (id, user_id, full_name, phone, city, street, street_number)
  VALUES (v_address, v_buyer, 'לקוח בדיקה', '0500000000', 'תל אביב', 'הרצל', '1');

  -- A shared order: supplier A ships, supplier B sells a coupon on the same one.
  INSERT INTO public.orders
    (id, user_id, status, subtotal_ils, total_ils, subtotal_agorot,
     customer_pays_now_agorot, address_id, paid_at)
  VALUES (v_order, v_buyer, 'paid', 150, 150, 15000, 15000, v_address, now());

  INSERT INTO public.order_items
    (id, order_id, product_id, product_type, supplier_id, quantity,
     unit_price_ils, total_price_ils, commission_percent, supplier_payout_ils,
     unit_price_agorot, face_value_agorot, customer_pays_now_agorot,
     platform_fee_agorot, supplier_due_agorot, cashback_percent,
     cashback_amount_agorot, platform_percent, settlement_status, item_status)
  VALUES
    (v_item_a, v_order, v_prod_a, 'physical', v_sup_a, 1,
     100, 100, 15, 85, 10000, 10000, 10000, 1500, 8500, 0, 0, 15,
     'split_executed', 'pending'),
    (v_item_b, v_order, v_prod_b, 'coupon', v_sup_b, 1,
     100, 100, 30, 70, 10000, 10000, 5000, 1500, 3500, 0, 0, 30,
     'escrow_held', 'issued');

  -- An order supplier A is not on at all.
  INSERT INTO public.orders
    (id, user_id, status, subtotal_ils, total_ils, subtotal_agorot,
     customer_pays_now_agorot, paid_at)
  VALUES (v_solo, v_buyer, 'paid', 50, 50, 5000, 5000, now());

  INSERT INTO public.order_items
    (order_id, product_id, product_type, supplier_id, quantity,
     unit_price_ils, total_price_ils, commission_percent, supplier_payout_ils,
     unit_price_agorot, face_value_agorot, customer_pays_now_agorot,
     platform_fee_agorot, supplier_due_agorot, cashback_percent,
     cashback_amount_agorot, platform_percent, settlement_status, item_status)
  VALUES
    (v_solo, v_prod_b, 'coupon', v_sup_b, 1,
     100, 100, 30, 70, 10000, 10000, 5000, 1500, 3500, 0, 0, 30,
     'escrow_held', 'issued');

  SET LOCAL ROLE authenticated;

  -- ── A: ships. Sees own line, own order, and the address ──────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_staff_a, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.order_items WHERE order_id = v_order;
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'SECURITY: supplier A sees % lines on the shared order, must see only its own', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.order_items WHERE id = v_item_b;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: supplier A reads a co-supplier''s order line';
  END IF;

  SELECT count(*) INTO v_count FROM public.orders WHERE id = v_order;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'supplier A cannot read the order carrying its line (% rows)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.orders WHERE id = v_solo;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: supplier A reads an order it has no line on';
  END IF;

  SELECT count(*) INTO v_count FROM public.user_addresses WHERE id = v_address;
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'the shipping supplier cannot read the address it must ship to (% rows)', v_count;
  END IF;

  -- ── B: coupons only. Sees its line and order, but NO address ─────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_staff_b, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.order_items WHERE order_id = v_order;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'SECURITY: supplier B sees % lines on the shared order', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.orders WHERE id = v_order;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'supplier B cannot read the order carrying its coupon line';
  END IF;

  -- The point of the whole address rule: a coupon is redeemed in person, so
  -- nothing about it justifies handing over where the customer lives.
  SELECT count(*) INTO v_count FROM public.user_addresses WHERE id = v_address;
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'SECURITY: a coupon-only supplier reads the customer address (% rows)', v_count;
  END IF;

  -- ── Neither supplier reads the customer's profile ────────────────────────
  SELECT count(*) INTO v_count FROM public.profiles WHERE id = v_buyer;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: a supplier reads the customer profile row';
  END IF;

  -- ── Read-only: no supplier may write an order or a line ──────────────────
  BEGIN
    UPDATE public.order_items SET item_status = 'delivered' WHERE id = v_item_b;
    IF FOUND THEN
      RAISE EXCEPTION 'SECURITY: a supplier updated an order line';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE '%SECURITY:%' THEN RAISE; END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'supplier scoping (078): all assertions passed';
END $$;

ROLLBACK;
