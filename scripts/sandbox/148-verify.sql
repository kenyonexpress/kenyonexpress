-- Apply 148 against this database, then prove:
-- 1. A real transfer with p_order_id moves ILS 1:1 and conserves the sum.
-- 2. Integer agorot in audit_log.changes match round(amount * 100).
-- 3. Replay of the same idempotency_key does not write a second audit row.
-- 4. A transfer without p_order_id does not write audit_log.

BEGIN;

DELETE FROM public.wallet_entries;
DELETE FROM public.audit_log;
DELETE FROM public.wallet_accounts;

INSERT INTO public.wallet_accounts (id, user_id, code, balance_ils)
VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'platform:cashback_reserve', 1000.00),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa', NULL, 0.00);

DO $$
DECLARE
  v_first uuid;
  v_replay uuid;
  v_no_order uuid;
  v_reserve numeric;
  v_user numeric;
  v_sum numeric;
  v_audit_count int;
  v_agorot bigint;
  v_reason text;
BEGIN
  v_first := public.fn_wallet_transfer(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    17.10,
    'order_refund',
    'refund:order-sandbox:wallet',
    '00000000-0000-0000-0000-0000000000bb'
  );

  v_replay := public.fn_wallet_transfer(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    17.10,
    'order_refund',
    'refund:order-sandbox:wallet',
    '00000000-0000-0000-0000-0000000000bb'
  );

  IF v_first IS DISTINCT FROM v_replay THEN
    RAISE EXCEPTION 'replay returned a different wallet_entries id: % vs %', v_first, v_replay;
  END IF;

  SELECT balance_ils INTO STRICT v_reserve
    FROM public.wallet_accounts WHERE id = '00000000-0000-0000-0000-000000000001';
  SELECT balance_ils INTO STRICT v_user
    FROM public.wallet_accounts WHERE id = '00000000-0000-0000-0000-000000000002';
  SELECT sum(balance_ils) INTO STRICT v_sum FROM public.wallet_accounts;

  IF v_reserve <> 982.90 THEN
    RAISE EXCEPTION 'reserve balance %, expected 982.90', v_reserve;
  END IF;
  IF v_user <> 17.10 THEN
    RAISE EXCEPTION 'user balance %, expected 17.10', v_user;
  END IF;
  IF v_sum <> 1000.00 THEN
    RAISE EXCEPTION 'sum of balances %, expected 1000.00 (conservation failed)', v_sum;
  END IF;

  SELECT count(*) INTO STRICT v_audit_count
    FROM public.audit_log
   WHERE entity_type = 'order'
     AND entity_id = '00000000-0000-0000-0000-0000000000bb';
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'audit_log rows %, expected 1 after replay', v_audit_count;
  END IF;

  SELECT (changes->>'amount_agorot')::bigint, changes->>'reason'
    INTO STRICT v_agorot, v_reason
    FROM public.audit_log
   WHERE entity_id = '00000000-0000-0000-0000-0000000000bb';
  IF v_agorot <> 1710 THEN
    RAISE EXCEPTION 'audit amount_agorot %, expected 1710', v_agorot;
  END IF;
  IF v_reason <> 'order_refund' THEN
    RAISE EXCEPTION 'audit reason %, expected order_refund', v_reason;
  END IF;

  v_no_order := public.fn_wallet_transfer(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    5.00,
    'admin_credit',
    'sandbox:no-order',
    NULL
  );
  IF v_no_order IS NULL THEN
    RAISE EXCEPTION 'no-order transfer returned null';
  END IF;

  SELECT count(*) INTO STRICT v_audit_count FROM public.audit_log;
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'audit_log rows % after a NULL p_order_id transfer, expected still 1', v_audit_count;
  END IF;

  SELECT sum(balance_ils) INTO STRICT v_sum FROM public.wallet_accounts;
  IF v_sum <> 1000.00 THEN
    RAISE EXCEPTION 'sum after second transfer %, expected 1000.00', v_sum;
  END IF;

  RAISE NOTICE '148 sandbox ok: first=% replay=% reserve=% user=% sum=% audit_agorot=%',
    v_first, v_replay, v_reserve, v_user, v_sum, v_agorot;
END $$;

COMMIT;
