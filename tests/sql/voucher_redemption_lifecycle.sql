-- Voucher redemption lifecycle harness (migration 074).
--
-- The money legs of redemption live entirely in plpgsql, so no amount of vitest
-- reaches them. This drives the real functions against real Postgres and
-- asserts rather than prints: a violated guarantee raises.
--
--   docker exec -i supabase_db_kenyonexpress psql -U postgres -v ON_ERROR_STOP=1 \
--     < tests/sql/voucher_redemption_lifecycle.sql
--
-- Builds its own fixtures and rolls everything back, so it is safe to run
-- against a dev database repeatedly. Requires 073, 074 and their dependencies.
--
-- What it covers, in order:
--   1. a scan by someone who is not a supplier member is refused and logged
--   2. a scan by the wrong supplier reports not_found (anti-enumeration)
--   3. a valid scan redeems, releases that voucher's hold, and leaves the ORDER
--      LINE held while a sibling voucher is still outstanding
--   4. rescanning the same code reports already_redeemed and releases nothing
--   5. scanning the sibling flips the line to escrow_released
--   6. an idempotency key replays the first answer instead of acting twice
--   7. expiry sweeps status AND refunds the supplier's hold
--   8. an expired voucher credits the customer's wallet exactly once (C6)

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_supplier    uuid := gen_random_uuid();
  v_other_sup   uuid := gen_random_uuid();
  v_product     uuid := gen_random_uuid();
  v_buyer       uuid := gen_random_uuid();
  v_scanner     uuid := gen_random_uuid();
  v_outsider    uuid := gen_random_uuid();
  v_other_scan  uuid := gen_random_uuid();
  v_order       uuid := gen_random_uuid();
  v_item        uuid := gen_random_uuid();
  v_v1          uuid := gen_random_uuid();
  v_v2          uuid := gen_random_uuid();
  v_expired     uuid := gen_random_uuid();
  v_result      jsonb;
  v_text        text;
  v_count       integer;
  v_status      text;
  v_balance     numeric;
  v_adjust      uuid;
BEGIN
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  -- Local-only divergence. Some dev databases carry `wallet_accounts
  -- .owner_type NOT NULL` from one of the four historical wallet shapes; the
  -- hosted project has no such column. `fn_ensure_wallet_account()` fires on
  -- every new profile and inserts (user_id) only, so on those databases
  -- creating a user fails on a constraint that does not exist in production.
  -- A default for the length of this transaction papers over the difference
  -- without pretending to fix it; the ROLLBACK takes it back out.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_accounts'
      AND column_name = 'owner_type' AND is_nullable = 'NO'
  ) THEN
    EXECUTE $ddl$ALTER TABLE public.wallet_accounts ALTER COLUMN owner_type SET DEFAULT 'user'$ddl$;
  END IF;

  -- Four identities: the buyer, a scanner who works at the supplier, an
  -- outsider with no membership at all, and a scanner at a different supplier.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u::text || '@harness.local', '', now(), now(), now()
  FROM unnest(ARRAY[v_buyer, v_scanner, v_outsider, v_other_scan]) AS u;

  INSERT INTO public.profiles (id, email)
  SELECT u, u::text || '@harness.local'
  FROM unnest(ARRAY[v_buyer, v_scanner, v_outsider, v_other_scan]) AS u
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.suppliers (id, name) VALUES
    (v_supplier,  'עסק הבדיקה'),
    (v_other_sup, 'עסק אחר');

  INSERT INTO public.supplier_members (supplier_id, user_id, is_active) VALUES
    (v_supplier,  v_scanner,    true),
    (v_other_sup, v_other_scan, true);

  -- Coupon priced 50 against a 100 list price, platform on 30%.
  INSERT INTO public.products
    (id, supplier_id, type, slug, name_he, price_ils, platform_percent,
     coupon_expiry_days, commission_percent, coupon_price_ils)
  VALUES
    (v_product, v_supplier, 'coupon', 'harness-coupon', 'קופון בדיקה',
     100, 30, 90, 30, 50);

  INSERT INTO public.orders
    (id, user_id, status, subtotal_ils, total_ils, subtotal_agorot,
     customer_pays_now_agorot, paid_at)
  VALUES (v_order, v_buyer, 'paid', 100, 100, 10000, 10000, now());

  -- Two units on one line: 10000 agorot charged online, 3000 platform,
  -- 7000 held for the supplier, 10000 still collectable at the counter.
  INSERT INTO public.order_items
    (id, order_id, product_id, product_type, supplier_id, quantity,
     unit_price_ils, total_price_ils, commission_percent, supplier_payout_ils,
     unit_price_agorot, face_value_agorot, customer_pays_now_agorot,
     platform_fee_agorot, supplier_due_agorot, cashback_percent,
     cashback_amount_agorot, platform_percent, settlement_status, item_status)
  VALUES
    (v_item, v_order, v_product, 'coupon', v_supplier, 2,
     100, 200, 30, 70,
     10000, 20000, 10000,
     3000, 7000, 0,
     0, 30, 'escrow_held', 'issued');

  INSERT INTO public.vouchers
    (id, code, qr_payload, order_id, order_item_id, product_id, supplier_id,
     user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
     platform_percent, status, offer_valid_until, expires_at)
  VALUES
    (v_v1, 'HARNESS001', 'qr-1', v_order, v_item, v_product, v_supplier,
     v_buyer, 10000, 5000, 5000, 30, 'issued', now() + interval '30 days',
     now() + interval '30 days'),
    (v_v2, 'HARNESS002', 'qr-2', v_order, v_item, v_product, v_supplier,
     v_buyer, 10000, 5000, 5000, 30, 'issued', now() + interval '30 days',
     now() + interval '30 days');

  INSERT INTO public.escrow_holds
    (voucher_id, order_id, order_item_id, supplier_id,
     held_agorot, commission_agorot, release_agorot, status)
  VALUES
    (v_v1, v_order, v_item, v_supplier, 5000, 1500, 3500, 'held'),
    (v_v2, v_order, v_item, v_supplier, 5000, 1500, 3500, 'held');

  -- ── 1. No membership: refused, and the attempt is on the record ───────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);

  v_result := public.redeem_voucher('HARNESS001', 'camera', NULL);
  IF v_result->>'outcome' <> 'unauthorized' THEN
    RAISE EXCEPTION 'a non-member scan returned %, expected unauthorized', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE scanned_by = v_outsider AND outcome = 'unauthorized';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the refused scan was not logged (% rows)', v_count;
  END IF;

  SELECT status INTO v_status FROM public.vouchers WHERE id = v_v1;
  IF v_status <> 'issued' THEN
    RAISE EXCEPTION 'SECURITY: a non-member changed the voucher to %', v_status;
  END IF;

  -- ── 2. Wrong supplier: not_found to the caller, truth in the log ──────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other_scan, 'role', 'authenticated')::text, true);

  v_result := public.redeem_voucher('HARNESS001', 'camera', NULL);
  IF v_result->>'outcome' <> 'not_found' THEN
    RAISE EXCEPTION 'a wrong-supplier scan leaked %, expected not_found', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE scanned_by = v_other_scan AND outcome = 'wrong_supplier';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'wrong_supplier was not recorded as itself (% rows)', v_count;
  END IF;

  -- ── 3. The real scan: redeem, release THIS hold, keep the line held ───────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_scanner, 'role', 'authenticated')::text, true);

  v_result := public.redeem_voucher('harness001', 'camera', NULL);
  IF v_result->>'outcome' <> 'success' THEN
    RAISE EXCEPTION 'the valid scan failed: %', v_result;
  END IF;
  -- The counter is told what to collect, and it is the snapshot, not a recompute.
  IF (v_result->>'remaining_amount_due_agorot')::integer <> 5000 THEN
    RAISE EXCEPTION 'the counter was told to collect %, expected 5000',
      v_result->>'remaining_amount_due_agorot';
  END IF;

  SELECT status INTO v_status FROM public.escrow_holds WHERE voucher_id = v_v1;
  IF v_status <> 'released' THEN
    RAISE EXCEPTION 'redemption did not release the hold (status %)', v_status;
  END IF;

  SELECT status INTO v_status FROM public.escrow_holds WHERE voucher_id = v_v2;
  IF v_status <> 'held' THEN
    RAISE EXCEPTION 'redeeming one voucher released a sibling hold (status %)', v_status;
  END IF;

  SELECT settlement_status::text INTO v_status FROM public.order_items WHERE id = v_item;
  IF v_status <> 'escrow_held' THEN
    RAISE EXCEPTION
      'the line settled at % while a voucher was still outstanding', v_status;
  END IF;

  -- ── 4. Rescan: refused, and nothing moves a second time ───────────────────
  v_result := public.redeem_voucher('HARNESS-001', 'manual', NULL);
  IF v_result->>'outcome' <> 'already_redeemed' THEN
    RAISE EXCEPTION 'a replayed scan returned %, expected already_redeemed', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.escrow_holds
  WHERE voucher_id = v_v1 AND status = 'released';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the hold was released more than once (% rows)', v_count;
  END IF;

  -- ── 5. The last voucher of the line closes it ─────────────────────────────
  v_result := public.redeem_voucher('HARNESS002', 'camera', NULL);
  IF v_result->>'outcome' <> 'success' THEN
    RAISE EXCEPTION 'the sibling scan failed: %', v_result;
  END IF;

  SELECT settlement_status::text INTO v_status FROM public.order_items WHERE id = v_item;
  IF v_status <> 'escrow_released' THEN
    RAISE EXCEPTION
      'the line stayed % after every voucher was scanned', v_status;
  END IF;

  SELECT count(*) INTO v_count FROM public.escrow_holds
  WHERE order_item_id = v_item AND status = 'released';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'expected both holds released, found %', v_count;
  END IF;

  -- ── 6. Idempotency: a retried request answers, it does not act again ──────
  INSERT INTO public.vouchers
    (id, code, qr_payload, order_id, order_item_id, product_id, supplier_id,
     user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
     platform_percent, status, offer_valid_until, expires_at)
  VALUES
    (gen_random_uuid(), 'HARNESS003', 'qr-3', v_order, v_item, v_product,
     v_supplier, v_buyer, 10000, 5000, 5000, 30, 'issued',
     now() + interval '30 days', now() + interval '30 days');

  v_result := public.redeem_voucher('HARNESS003', 'camera', 'idem-key-1');
  IF v_result->>'outcome' <> 'success' THEN
    RAISE EXCEPTION 'the keyed scan failed: %', v_result;
  END IF;

  v_result := public.redeem_voucher('HARNESS003', 'camera', 'idem-key-1');
  IF v_result->>'outcome' <> 'success' OR (v_result->>'replayed') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'the replay returned % instead of the first answer', v_result;
  END IF;

  -- Reusing one key for a different code is a client bug, not a voucher to guess.
  v_result := public.redeem_voucher('HARNESS001', 'camera', 'idem-key-1');
  IF v_result->>'outcome' <> 'invalid_request' THEN
    RAISE EXCEPTION 'a key reused across codes returned %', v_result;
  END IF;

  -- ── 7. Expiry sweeps the status AND gives the hold back ───────────────────
  INSERT INTO public.vouchers
    (id, code, qr_payload, order_id, order_item_id, product_id, supplier_id,
     user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
     platform_percent, status, offer_valid_until, expires_at)
  VALUES
    (v_expired, 'HARNESS004', 'qr-4', v_order, v_item, v_product, v_supplier,
     v_buyer, 10000, 5000, 5000, 30, 'issued',
     now() - interval '1 day', now() - interval '1 day');

  INSERT INTO public.escrow_holds
    (voucher_id, order_id, order_item_id, supplier_id,
     held_agorot, commission_agorot, release_agorot, status)
  VALUES (v_expired, v_order, v_item, v_supplier, 5000, 1500, 3500, 'held');

  PERFORM public.expire_vouchers();

  SELECT status INTO v_status FROM public.vouchers WHERE id = v_expired;
  IF v_status <> 'expired' THEN
    RAISE EXCEPTION 'the sweep left the voucher at %', v_status;
  END IF;

  SELECT status INTO v_status FROM public.escrow_holds WHERE voucher_id = v_expired;
  IF v_status <> 'refunded' THEN
    RAISE EXCEPTION 'expiry left the supplier hold at %, expected refunded', v_status;
  END IF;

  -- An expired voucher cannot then be scanned.
  v_result := public.redeem_voucher('HARNESS004', 'camera', NULL);
  IF v_result->>'outcome' <> 'expired' THEN
    RAISE EXCEPTION 'an expired voucher scanned as %', v_result;
  END IF;

  -- ── 8. C6: expiry is not forfeiture, the customer gets their money back ───
  SELECT id INTO v_adjust FROM public.wallet_accounts WHERE code = 'platform:adjustments';
  IF v_adjust IS NULL THEN
    RAISE EXCEPTION 'fixture: platform:adjustments wallet account is missing';
  END IF;

  v_count := public.credit_expired_vouchers();
  IF v_count < 1 THEN
    RAISE EXCEPTION 'no expired voucher was credited (returned %)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.wallet_entries
  WHERE idempotency_key = 'voucher:' || v_expired::text || ':expiry_credit';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one expiry credit, found %', v_count;
  END IF;

  -- The credit is what they paid online (5000 agorot = 50.00), not the face value.
  SELECT amount_ils INTO v_balance FROM public.wallet_entries
  WHERE idempotency_key = 'voucher:' || v_expired::text || ':expiry_credit';
  IF v_balance <> 50.00 THEN
    RAISE EXCEPTION 'credited % ILS, expected 50.00 (the online payment)', v_balance;
  END IF;

  -- Running again must credit nothing: the key is what makes a retry safe.
  PERFORM public.credit_expired_vouchers();
  SELECT count(*) INTO v_count FROM public.wallet_entries
  WHERE idempotency_key = 'voucher:' || v_expired::text || ':expiry_credit';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a second sweep double-credited (% rows)', v_count;
  END IF;

  RAISE NOTICE 'voucher redemption lifecycle: all assertions passed';
END $$;

ROLLBACK;
