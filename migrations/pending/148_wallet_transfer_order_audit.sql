-- 148: fn_wallet_transfer writes an order-scoped audit_log row.
--
-- STATUS: DRAFT, NOT APPLIED. Requires explicit approval and MCP
-- apply_migration. Never `db push`. Sandbox first, never production from this
-- file without a human.
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
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

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
