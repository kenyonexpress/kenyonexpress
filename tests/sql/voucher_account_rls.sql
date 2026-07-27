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

ROLLBACK;
