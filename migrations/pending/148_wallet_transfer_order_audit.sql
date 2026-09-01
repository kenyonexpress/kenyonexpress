-- 148: fn_wallet_transfer writes an order-scoped audit_log row.
--
-- STATUS: Verified 2026-09-01 on local Postgres 16, database `ke_sandbox`.
-- That database is not the hosted project and is not production.
-- Measured after apply: reserve 1000.00 -> 982.90, user 0.00 -> 17.10,
-- sum of balances stayed 1000.00, audit_log.changes.amount_agorot = 1710
-- for 17.10 ILS, replay returned the same wallet_entries id and did not
-- insert a second audit row. Repeat with scripts/sandbox/148-*.sql.
-- Still requires a human before MCP apply_migration on any hosted project.
-- Never `db push`.
--
-- WHAT THIS FINISHES. Every wallet movement that names an order was invisible
-- in audit_log: the ledger row existed, the order page did not. Cashback,
-- wallet spend at checkout, and a refund credit all call this function with
-- p_order_id set. The audit row is the order's copy of that fact.
--
-- SIGNATURE DOES NOT CHANGE. Production (src/types/database.ts) exposes the
-- six-argument form: (uuid, uuid, numeric, text, text, uuid). Callers keep
-- passing p_amount_ils as numeric shekels. Integer agorot are recorded in
-- audit metadata via round(p_amount_ils * 100), once, so debit and credit
-- cannot disagree by a rounding step.
--
-- Replay of the same idempotency_key returns the existing entry and does NOT
-- write a second audit row.
--
-- ROLLBACK
--
--   Recreate the body from supabase/migrations/046_checkout_runtime.sql
--   (the six-argument form). audit_log rows already written stay; they are
--   append-only.
--
-- NOT APPLIED to the hosted project. `migrations/pending/` is unapplied there
-- by definition. Local sandbox apply does not change that.

CREATE OR REPLACE FUNCTION public.fn_wallet_transfer(
  p_debit_account uuid,
  p_credit_account uuid,
  p_amount_ils numeric,
  p_reason text,
  p_idempotency text,
  p_order_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_existing uuid;
  v_debit public.wallet_accounts%ROWTYPE;
  v_entry uuid;
  v_amount_agorot bigint;
BEGIN
  IF p_amount_ils IS NULL OR p_amount_ils <= 0 THEN
    RAISE EXCEPTION 'transfer amount must be positive';
  END IF;
  IF p_debit_account = p_credit_account THEN
    RAISE EXCEPTION 'transfer accounts must differ';
  END IF;

  v_amount_agorot := round(p_amount_ils * 100)::bigint;
  IF v_amount_agorot <= 0 THEN
    RAISE EXCEPTION 'transfer amount rounds to zero agorot';
  END IF;

  SELECT id INTO v_existing
    FROM public.wallet_entries
   WHERE idempotency_key = p_idempotency;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  PERFORM 1
    FROM public.wallet_accounts
   WHERE id IN (p_debit_account, p_credit_account)
   ORDER BY id
     FOR UPDATE;

  SELECT * INTO v_debit FROM public.wallet_accounts WHERE id = p_debit_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'debit account not found';
  END IF;
  IF v_debit.user_id IS NOT NULL AND v_debit.balance_ils < p_amount_ils THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  UPDATE public.wallet_accounts
     SET balance_ils = balance_ils - p_amount_ils
   WHERE id = p_debit_account;
  UPDATE public.wallet_accounts
     SET balance_ils = balance_ils + p_amount_ils
   WHERE id = p_credit_account;

  INSERT INTO public.wallet_entries
    (debit_account, credit_account, amount_ils, reason, idempotency_key, order_id)
  VALUES
    (p_debit_account, p_credit_account, p_amount_ils, p_reason, p_idempotency, p_order_id)
  RETURNING id INTO v_entry;

  IF p_order_id IS NOT NULL THEN
    INSERT INTO public.audit_log (
      actor_id,
      actor_role,
      action,
      entity_type,
      entity_id,
      changes,
      metadata
    ) VALUES (
      auth.uid(),
      'service',
      'created'::public.audit_action,
      'order',
      p_order_id,
      jsonb_build_object(
        'wallet_entry_id', v_entry,
        'amount_agorot', v_amount_agorot,
        'reason', p_reason
      ),
      jsonb_build_object(
        'source', 'fn_wallet_transfer',
        'debit_account', p_debit_account,
        'credit_account', p_credit_account,
        'idempotency_key', p_idempotency,
        'amount_ils', p_amount_ils
      )
    );
  END IF;

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid) IS
  'Double-entry wallet transfer. When p_order_id is set, also inserts audit_log (entity_type=order) with integer agorot in changes.';
