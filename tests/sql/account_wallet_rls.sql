-- Account + wallet RLS harness.
--
-- Run against a database that has migration 052 applied. Everything runs inside
-- a transaction that is rolled back, so it is safe against dev data. It asserts
-- rather than prints: a violated guarantee raises.
--
--   psql "$DATABASE_URL" -v owner=<uuid> -v stranger=<uuid> -f tests/sql/account_wallet_rls.sql
--
-- `owner` must be a profile that owns at least one wallet_entries row.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_owner      uuid := current_setting('tests.owner')::uuid;
  v_stranger   uuid := current_setting('tests.stranger')::uuid;
  v_owner_acct uuid;
  v_platform   uuid;
  v_count      integer;
  v_balance    numeric;
BEGIN
  SELECT id INTO v_owner_acct FROM public.wallet_accounts WHERE user_id = v_owner;
  SELECT id INTO v_platform   FROM public.wallet_accounts WHERE code = 'platform:revenue';

  IF v_owner_acct IS NULL THEN
    RAISE EXCEPTION 'fixture: owner % has no wallet account', v_owner;
  END IF;

  SELECT balance_ils INTO v_balance FROM public.wallet_accounts WHERE id = v_owner_acct;

  -- ── 1. The owner sees their own ledger ────────────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO v_count FROM public.wallet_entries;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'owner cannot read their own wallet_entries (052 policy missing?)';
  END IF;

  SELECT count(*) INTO v_count FROM public.wallet_accounts;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner should see exactly their own wallet account, saw %', v_count;
  END IF;

  -- ── 2. The ledger is append-only even for its owner ───────────────────────
  BEGIN
    INSERT INTO public.wallet_entries
      (debit_account, credit_account, amount_ils, reason, idempotency_key)
    VALUES (v_platform, v_owner_acct, 9999, 'self_mint', 'rls-harness-probe');
    RAISE EXCEPTION 'SECURITY: an authenticated user inserted a wallet entry';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE '%SECURITY:%' THEN RAISE; END IF;
  END;

  UPDATE public.wallet_entries SET amount_ils = 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY: an authenticated user updated % ledger rows', v_count;
  END IF;

  DELETE FROM public.wallet_entries;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY: an authenticated user deleted % ledger rows', v_count;
  END IF;

  UPDATE public.wallet_accounts SET balance_ils = 9999 WHERE id = v_owner_acct;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY: an authenticated user rewrote their own balance';
  END IF;

  -- ── 3. A stranger sees none of it ─────────────────────────────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_stranger, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO v_count FROM public.wallet_entries;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY: a stranger read % wallet entries', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.v_wallet_ledger;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY: v_wallet_ledger leaked % rows to a stranger', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.user_addresses;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY: a stranger read % addresses', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.payment_tokens;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY: a stranger read % saved cards', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.coupon_codes;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'SECURITY: a stranger read % coupons', v_count;
  END IF;

  -- Active cashback rules ARE public on purpose (storefront messaging).
  SELECT count(*) INTO v_count FROM public.cashback_rules;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'active cashback rules should be publicly readable';
  END IF;

  -- ── 4. Nothing drifted ────────────────────────────────────────────────────
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.v_wallet_balance_drift;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'wallet balance drifted from the ledger on % accounts', v_count;
  END IF;

  RAISE NOTICE 'account/wallet RLS harness passed';
END $$;

ROLLBACK;
