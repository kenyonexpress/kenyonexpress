-- Voucher redemption lifecycle harness (migrations 073, 074, 085).
--
-- The redemption path lives entirely in plpgsql, so no amount of vitest reaches
-- it. This drives the real functions against real Postgres and asserts rather
-- than prints: a violated guarantee raises.
--
--   docker exec -i supabase_db_kenyonexpress psql -U postgres -v ON_ERROR_STOP=1 \
--     < tests/sql/voucher_redemption_lifecycle.sql
--
-- Builds its own fixtures and rolls everything back, so it is safe to run
-- against a dev database repeatedly. Requires 073, 074, 085 and their
-- dependencies.
--
-- REWRITTEN 2026-07-28, twice over:
--
--   1. It had stopped running at all. The fixtures insert products.price_ils,
--      renamed by 059 to price_agorot, so every run since 059 was applied
--      locally died on 42703 in the first INSERT. A harness that cannot build
--      its fixtures asserts nothing, and nothing announced that.
--
--   2. It asserted the abolished escrow model - that a scan releases a hold and
--      moves the order line escrow_held -> escrow_released. Under model
--      035ef8e the whole coupon prepayment is the platform's at payment, the
--      supplier gets nothing from us on a coupon, and no hold is ever written.
--      Those assertions are replaced by their opposite: a scan must move NO
--      money and must leave the order line exactly as payment left it.
--
-- What it covers, in order:
--   1. a scan by someone who is not a supplier member is refused and logged
--   2. a scan by the wrong supplier reports not_found (anti-enumeration)
--   3. a valid scan redeems, tells the counter what to collect, and moves no money
--   4. rescanning the same code reports already_redeemed and changes nothing
--   5. every attempt carries its address and device into the audit row
--   6. an idempotency key replays the first answer instead of acting twice
--   7. an expired voucher cannot be scanned, before or after the sweep
--   8. expiry is not forfeiture: the customer is credited exactly once (C6)
--   9. a pre-database rejection is logged, including with no session at all
--
-- Concurrency is deliberately NOT here: two simultaneous scans need two
-- connections, which one psql session cannot produce. See
-- scripts/_voucher-race.mjs.

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
  v_count       integer;
  v_status      text;
  v_settlement  text;
  v_balance     numeric;
  v_ip          inet;
  v_ua          text;
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

  -- Coupon priced 5000 agorot against a 10000 list price, platform on 30%.
  -- Both halves of the split are stored: products_split_pair_sums_to_100 (070)
  -- rejects a row where they do not add to 100.
  INSERT INTO public.products
    (id, supplier_id, type, slug, name_he, price_agorot, coupon_price_agorot,
     platform_percent, supplier_split_percent, coupon_expiry_days, offer_valid_until)
  VALUES
    (v_product, v_supplier, 'coupon', 'harness-coupon', 'קופון בדיקה',
     10000, 5000, 30, 70, 90, now() + interval '365 days');

  INSERT INTO public.orders
    (id, user_id, status, subtotal_agorot, discount_agorot,
     wallet_applied_agorot, cashback_applied_agorot,
     customer_pays_now_agorot, total_agorot, paid_at)
  VALUES (v_order, v_buyer, 'paid', 10000, 0, 0, 0, 10000, 10000, now());

  -- Two units on one line. Model 035ef8e: the customer paid 10000 agorot
  -- online, ALL of it is the platform's, the supplier is due 0 from us, and
  -- 10000 more is collected in cash at the counter across the two vouchers.
  -- The line is settled at payment, which is what settlement_status records.
  INSERT INTO public.order_items
    (id, order_id, product_id, product_type, supplier_id, quantity,
     unit_price_agorot, total_price_agorot, face_value_agorot,
     customer_pays_now_agorot, platform_fee_agorot, supplier_due_agorot,
     cashback_amount_agorot, platform_bp, supplier_split_percent,
     settlement_status, item_status)
  VALUES
    (v_item, v_order, v_product, 'coupon', v_supplier, 2,
     5000, 10000, 20000,
     10000, 10000, 0,
     0, 3000, 70,
     'split_executed', 'issued');

  INSERT INTO public.vouchers
    (id, code, qr_payload, order_id, order_item_id, product_id, supplier_id,
     user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
     platform_bp, status, offer_valid_until, expires_at)
  VALUES
    (v_v1, 'HARNESS001', 'qr-1', v_order, v_item, v_product, v_supplier,
     v_buyer, 10000, 5000, 5000, 3000, 'issued', now() + interval '30 days',
     now() + interval '30 days'),
    (v_v2, 'HARNESS002', 'qr-2', v_order, v_item, v_product, v_supplier,
     v_buyer, 10000, 5000, 5000, 3000, 'issued', now() + interval '30 days',
     now() + interval '30 days');

  -- ── 1. No membership: refused, and the attempt is on the record ───────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);

  v_result := public.redeem_voucher('HARNESS001', 'camera', NULL, '203.0.113.7', 'harness/1.0');
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

  v_result := public.redeem_voucher('HARNESS001', 'camera', NULL, '203.0.113.8', 'harness/1.0');
  IF v_result->>'outcome' <> 'not_found' THEN
    RAISE EXCEPTION 'a wrong-supplier scan leaked %, expected not_found', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE scanned_by = v_other_scan AND outcome = 'wrong_supplier';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'wrong_supplier was not recorded as itself (% rows)', v_count;
  END IF;

  -- ── 3. The real scan: redeems, and moves no money ─────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_scanner, 'role', 'authenticated')::text, true);

  -- Lower case and a stray separator both normalise to the stored code.
  v_result := public.redeem_voucher('harness001', 'camera', NULL, '198.51.100.4', 'Mozilla/5.0 (counter)');
  IF v_result->>'outcome' <> 'success' THEN
    RAISE EXCEPTION 'the valid scan failed: %', v_result;
  END IF;
  -- The counter is told what to collect, and it is the snapshot, not a recompute.
  IF (v_result->>'remaining_amount_due_agorot')::integer <> 5000 THEN
    RAISE EXCEPTION 'the counter was told to collect %, expected 5000',
      v_result->>'remaining_amount_due_agorot';
  END IF;

  SELECT status INTO v_status FROM public.vouchers WHERE id = v_v1;
  IF v_status <> 'redeemed' THEN
    RAISE EXCEPTION 'the scan left the voucher at %', v_status;
  END IF;

  SELECT status INTO v_status FROM public.vouchers WHERE id = v_v2;
  IF v_status <> 'issued' THEN
    RAISE EXCEPTION 'redeeming one voucher moved its sibling to %', v_status;
  END IF;

  -- The scan is not a money event under model 035ef8e. The line was settled
  -- when the order was paid and a scan must not disturb it, in either
  -- direction: this is the assertion that fails if the escrow legs ever come
  -- back without the model coming back with them.
  SELECT settlement_status::text INTO v_settlement
  FROM public.order_items WHERE id = v_item;
  IF v_settlement <> 'split_executed' THEN
    RAISE EXCEPTION
      'a scan changed the line settlement to %, expected split_executed', v_settlement;
  END IF;

  SELECT count(*) INTO v_count FROM public.escrow_holds WHERE order_item_id = v_item;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'redemption wrote % escrow hold rows under a no-escrow model', v_count;
  END IF;

  -- ── 4. Rescan: refused, and nothing happens a second time ────────────────
  v_result := public.redeem_voucher('HARNESS-001', 'manual', NULL, '198.51.100.4', NULL);
  IF v_result->>'outcome' <> 'already_redeemed' THEN
    RAISE EXCEPTION 'a replayed scan returned %, expected already_redeemed', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE voucher_id = v_v1 AND outcome = 'success';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'the voucher recorded % successful redemptions, expected 1', v_count;
  END IF;

  -- ── 5. The audit row can answer "from where", which is why 085 exists ─────
  SELECT ip_address, user_agent INTO v_ip, v_ua
  FROM public.voucher_redemptions
  WHERE voucher_id = v_v1 AND outcome = 'success';

  IF v_ip IS DISTINCT FROM '198.51.100.4'::inet THEN
    RAISE EXCEPTION 'the successful scan recorded ip %, expected 198.51.100.4', v_ip;
  END IF;
  IF v_ua IS DISTINCT FROM 'Mozilla/5.0 (counter)' THEN
    RAISE EXCEPTION 'the successful scan recorded user agent %', v_ua;
  END IF;

  SELECT ip_address INTO v_ip FROM public.voucher_redemptions
  WHERE scanned_by = v_outsider AND outcome = 'unauthorized';
  IF v_ip IS DISTINCT FROM '203.0.113.7'::inet THEN
    RAISE EXCEPTION 'a REFUSED scan lost its address (got %)', v_ip;
  END IF;

  -- A header is attacker-controlled text. An unparseable one is recorded as
  -- NULL; it must never raise and cost a paying customer their redemption.
  v_result := public.redeem_voucher('HARNESS002', 'camera', 'idem-key-ip',
                                    'not-an-ip-address', NULL);
  IF v_result->>'outcome' <> 'success' THEN
    RAISE EXCEPTION 'a malformed ip header broke a valid scan: %', v_result;
  END IF;

  SELECT ip_address INTO v_ip FROM public.voucher_redemptions
  WHERE voucher_id = v_v2 AND outcome = 'success';
  IF v_ip IS NOT NULL THEN
    RAISE EXCEPTION 'a malformed ip was stored as %, expected NULL', v_ip;
  END IF;

  -- ── 6. Idempotency: a retried request answers, it does not act again ──────
  v_result := public.redeem_voucher('HARNESS002', 'camera', 'idem-key-ip', NULL, NULL);
  IF v_result->>'outcome' <> 'success' OR (v_result->>'replayed') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'the replay returned % instead of the first answer', v_result;
  END IF;

  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE idempotency_key = 'idem-key-ip';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a replayed key wrote % audit rows, expected 1', v_count;
  END IF;

  -- Reusing one key for a different code is a client bug, not a voucher to guess.
  v_result := public.redeem_voucher('HARNESS001', 'camera', 'idem-key-ip', NULL, NULL);
  IF v_result->>'outcome' <> 'invalid_request' THEN
    RAISE EXCEPTION 'a key reused across codes returned %', v_result;
  END IF;

  -- ── 7. Expired: refused before the sweep runs, and after ─────────────────
  INSERT INTO public.vouchers
    (id, code, qr_payload, order_id, order_item_id, product_id, supplier_id,
     user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
     platform_bp, status, offer_valid_until, expires_at)
  VALUES
    (v_expired, 'HARNESS004', 'qr-4', v_order, v_item, v_product, v_supplier,
     v_buyer, 10000, 5000, 5000, 3000, 'issued',
     now() - interval '1 day', now() - interval '1 day');

  -- Still 'issued' in the column, already past expires_at: the sweep is a
  -- convenience, never the guard. The predicate inside redeem_voucher decides.
  v_result := public.redeem_voucher('HARNESS004', 'camera', NULL, '203.0.113.9', NULL);
  IF v_result->>'outcome' <> 'expired' THEN
    RAISE EXCEPTION
      'a voucher past its expiry but not yet swept scanned as %', v_result;
  END IF;

  SELECT status INTO v_status FROM public.vouchers WHERE id = v_expired;
  IF v_status <> 'issued' THEN
    RAISE EXCEPTION 'a refused scan mutated the voucher to %', v_status;
  END IF;

  PERFORM public.expire_vouchers();

  SELECT status INTO v_status FROM public.vouchers WHERE id = v_expired;
  IF v_status <> 'expired' THEN
    RAISE EXCEPTION 'the sweep left the voucher at %', v_status;
  END IF;

  v_result := public.redeem_voucher('HARNESS004', 'camera', NULL, NULL, NULL);
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

  -- The credit is what they paid online (5000 agorot), not the face value
  -- (10000) and not the balance the business collects (5000 in cash).
  SELECT amount_agorot INTO v_balance FROM public.wallet_entries
  WHERE idempotency_key = 'voucher:' || v_expired::text || ':expiry_credit';
  IF v_balance <> 5000 THEN
    RAISE EXCEPTION 'credited % agorot, expected 5000 (the online payment)', v_balance;
  END IF;

  -- Running again must credit nothing: the key is what makes a retry safe.
  PERFORM public.credit_expired_vouchers();
  SELECT count(*) INTO v_count FROM public.wallet_entries
  WHERE idempotency_key = 'voucher:' || v_expired::text || ':expiry_credit';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a second sweep double-credited (% rows)', v_count;
  END IF;

  -- ── 9. Rejected before the database was consulted, and still on record ────
  -- A forged QR fails its HMAC in the route, so the code it names is never
  -- looked up. Pre-085 this was recorded only for a signed-in caller, which
  -- dropped exactly the attempt worth keeping.
  PERFORM public.log_voucher_scan('FORGED0001', 'camera', 'invalid_signature',
                                  '203.0.113.55', 'evil/1.0');

  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE code_entered = 'FORGED0001' AND outcome = 'invalid_signature'
    AND scanned_by = v_scanner AND ip_address = '203.0.113.55'::inet;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'a signed-in forged scan logged % rows', v_count;
  END IF;

  -- No session at all: the stranger who opened /redeem/<forged>.
  PERFORM set_config('request.jwt.claims', NULL, true);

  PERFORM public.log_voucher_scan('FORGED0002', 'camera', 'invalid_signature',
                                  '203.0.113.56', 'evil/1.0');

  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE code_entered = 'FORGED0002' AND outcome = 'invalid_signature'
    AND scanned_by IS NULL AND ip_address = '203.0.113.56'::inet;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'an anonymous forged scan logged % rows, expected 1', v_count;
  END IF;

  -- ...but it cannot be used as an unbounded write primitive. Past the burst
  -- the insert is skipped: the abuse is already on record 20 times over.
  FOR v_count IN 1..40 LOOP
    PERFORM public.log_voucher_scan('FLOOD00001', 'camera', 'invalid_signature',
                                    '203.0.113.57', 'evil/1.0');
  END LOOP;

  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE ip_address = '203.0.113.57'::inet AND scanned_by IS NULL;
  IF v_count > 20 THEN
    RAISE EXCEPTION
      'anonymous logging is unbounded: % rows from one address', v_count;
  END IF;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'anonymous logging recorded nothing at all';
  END IF;

  -- An anonymous caller cannot manufacture a success, whatever it asks for.
  PERFORM public.log_voucher_scan('HARNESS002', 'camera', 'success',
                                  '203.0.113.58', 'evil/1.0');
  SELECT count(*) INTO v_count FROM public.voucher_redemptions
  WHERE ip_address = '203.0.113.58'::inet AND outcome = 'success';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SECURITY: log_voucher_scan wrote a success row';
  END IF;

  RAISE NOTICE 'voucher redemption lifecycle: all assertions passed';
END $$;

ROLLBACK;
