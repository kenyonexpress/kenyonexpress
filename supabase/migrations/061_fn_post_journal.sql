-- ============================================================================
-- 061_fn_post_journal.sql
--
-- Atomic ledger posting entry point for checkout v1. `src/lib/ledger.ts`
-- calls this RPC so that a journal header and all its lines are inserted in a
-- SINGLE transaction: the DEFERRABLE INITIALLY DEFERRED sum-zero trigger from
-- 050 (trg_ledger_lines_balanced) validates the whole journal at COMMIT, and
-- any unbalanced posting fails atomically. supabase-js cannot span multiple
-- inserts in one transaction, so this must live in the database.
--
-- Idempotency: ledger_journals.event_key is UNIQUE. Re-posting the same event
-- returns the existing journal id and inserts nothing (replay = no-op). This is
-- what makes webhook redelivery safe end to end.
--
-- Account resolution: each line names an account by (kind, supplier_id,
-- user_id); the function resolves/creates it via fn_ensure_ledger_account
-- (050), so callers never hardcode account ids.
--
-- Security: SECURITY DEFINER, service_role only. No client role may post.
--
-- ROLLBACK NOTE:
--   DROP FUNCTION IF EXISTS public.fn_post_journal(
--     public.ledger_event, text, jsonb, uuid, uuid, uuid, uuid, uuid, integer, text);
-- Purely additive; no table or column is altered by this migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_post_journal(
  p_event_type          public.ledger_event,
  p_event_key           text,
  p_lines               jsonb,
  p_order_id            uuid DEFAULT NULL,
  p_order_item_id       uuid DEFAULT NULL,
  p_payment_id          uuid DEFAULT NULL,
  p_coupon_code_id      uuid DEFAULT NULL,
  p_reverses_journal_id uuid DEFAULT NULL,
  p_vat_rate_bp         integer DEFAULT 1700,
  p_memo                text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_journal_id uuid;
  v_line       jsonb;
  v_line_no    smallint := 0;
  v_account_id uuid;
  v_amount     bigint;
  v_kind       public.ledger_account_kind;
  v_supplier   uuid;
  v_user       uuid;
BEGIN
  IF p_event_key IS NULL OR length(p_event_key) = 0 THEN
    RAISE EXCEPTION 'fn_post_journal: event_key is required';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'fn_post_journal: lines must be a non-empty json array';
  END IF;

  -- Idempotent replay: if this event was already posted, return it untouched.
  SELECT id INTO v_journal_id
  FROM public.ledger_journals
  WHERE event_key = p_event_key;
  IF FOUND THEN
    RETURN v_journal_id;
  END IF;

  INSERT INTO public.ledger_journals (
    event_type, event_key, order_id, order_item_id, payment_id,
    coupon_code_id, reverses_journal_id, vat_rate_bp, memo
  )
  VALUES (
    p_event_type, p_event_key, p_order_id, p_order_item_id, p_payment_id,
    p_coupon_code_id, p_reverses_journal_id, COALESCE(p_vat_rate_bp, 1700), p_memo
  )
  RETURNING id INTO v_journal_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_no := v_line_no + 1;
    v_kind     := (v_line ->> 'kind')::public.ledger_account_kind;
    v_supplier := NULLIF(v_line ->> 'supplier_id', '')::uuid;
    v_user     := NULLIF(v_line ->> 'user_id', '')::uuid;
    v_amount   := (v_line ->> 'amount_agorot')::bigint;

    IF v_amount = 0 THEN
      RAISE EXCEPTION 'fn_post_journal: zero-amount line at position %', v_line_no;
    END IF;

    v_account_id := public.fn_ensure_ledger_account(v_kind, v_supplier, v_user);

    INSERT INTO public.ledger_journal_lines (journal_id, line_no, account_id, amount_agorot, memo)
    VALUES (v_journal_id, v_line_no, v_account_id, v_amount, v_line ->> 'memo');
  END LOOP;

  -- Sum-zero is enforced by trg_ledger_lines_balanced at COMMIT; an unbalanced
  -- set of lines aborts this whole function.
  RETURN v_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_post_journal(
  public.ledger_event, text, jsonb, uuid, uuid, uuid, uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_post_journal(
  public.ledger_event, text, jsonb, uuid, uuid, uuid, uuid, uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_post_journal(
  public.ledger_event, text, jsonb, uuid, uuid, uuid, uuid, uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_post_journal(
  public.ledger_event, text, jsonb, uuid, uuid, uuid, uuid, uuid, integer, text) TO service_role;
