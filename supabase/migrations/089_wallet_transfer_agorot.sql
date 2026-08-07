-- 089_wallet_transfer_agorot.sql
--
-- LOCAL ONLY. NOT APPLIED TO PRODUCTION.
--
-- Every wallet movement in the system raises:
--
--     record "v_debit" has no field "balance_ils"
--
-- 059 renamed wallet_accounts.balance_ils to balance_agorot, and
-- wallet_entries/wallet_transactions.amount_ils to amount_agorot. Both
-- overloads of fn_wallet_transfer still read and write the old names, so the
-- function is dead in every direction:
--
--   * cashback earned on a purchase is never credited,
--   * a wallet balance can never be spent at checkout,
--   * credit_expired_vouchers() cannot refund an expired voucher, which is C6 -
--     "expiry is not forfeiture" - so a customer whose coupon lapses is simply
--     out the money they paid online.
--
-- Found by tests/sql/voucher_redemption_lifecycle.sql section 8 once the
-- harness could build its own fixtures again.
--
-- THE SIGNATURES DO NOT CHANGE. Callers pass p_amount_ils as a numeric in
-- shekels (finalize.ts, credit_expired_vouchers, the cashback triggers) and
-- keep doing so; the conversion to integer agorot happens once, on entry. This
-- is deliberately not the moment to push agorot out to every caller: that is a
-- wider change, and this migration exists to make the money move at all.
--
-- ROUNDING IS DONE ONCE AND THEN REUSED. Converting at each of the four write
-- sites would let the debit and the credit disagree by an agora on a
-- half-agora input, which is how a ledger stops balancing. v_amount_agorot is
-- computed at the top and every statement uses that one value.
--
-- Idempotent, forward-only.

-- ---------------------------------------------------------------------------
-- 1. The balance column: a default and a floor
--
--    balance_agorot arrived from the rename nullable and with no default, while
--    the column it replaced defaulted to 0. An account created without an
--    explicit balance therefore holds NULL, and NULL - 100 is NULL, so a
--    transfer against a fresh account silently blanks the balance instead of
--    going negative and being caught.
-- ---------------------------------------------------------------------------

UPDATE public.wallet_accounts SET balance_agorot = 0 WHERE balance_agorot IS NULL;

ALTER TABLE public.wallet_accounts
  ALTER COLUMN balance_agorot SET DEFAULT 0;

DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing FROM public.wallet_accounts WHERE balance_agorot IS NULL;
  IF v_missing = 0 THEN
    ALTER TABLE public.wallet_accounts ALTER COLUMN balance_agorot SET NOT NULL;
  ELSE
    RAISE WARNING '089: % wallet account(s) still hold a NULL balance_agorot', v_missing;
  END IF;
END $$;

-- The double-spend floor followed the old column into retirement, exactly as
-- vouchers_platform_percent_range did (087). It reads
-- `balance_ils_legacy >= 0` today, a column nothing writes, so it is vacuously
-- true and a user account could be driven negative without tripping anything.
ALTER TABLE public.wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_user_nonneg;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wallet_accounts'::regclass
      AND conname = 'wallet_accounts_user_nonneg_agorot'
  ) THEN
    ALTER TABLE public.wallet_accounts
      ADD CONSTRAINT wallet_accounts_user_nonneg_agorot
      CHECK (owner_type = 'platform' OR balance_agorot >= 0) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE public.wallet_accounts VALIDATE CONSTRAINT wallet_accounts_user_nonneg_agorot;
EXCEPTION WHEN check_violation THEN
  RAISE WARNING
    '089: a user wallet is already negative; wallet_accounts_user_nonneg_agorot stays NOT VALID. New writes are still checked.';
END $$;

-- ---------------------------------------------------------------------------
-- 2. fn_wallet_transfer(uuid, uuid, numeric, text, text, uuid)
--    The wallet_entries form (046).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_wallet_transfer(
  p_debit_account  uuid,
  p_credit_account uuid,
  p_amount_ils     numeric,
  p_reason         text,
  p_idempotency    text,
  p_order_id       uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_existing       uuid;
  v_debit          public.wallet_accounts%ROWTYPE;
  v_entry          uuid;
  v_amount_agorot  integer;
BEGIN
  IF p_amount_ils IS NULL OR p_amount_ils <= 0 THEN
    RAISE EXCEPTION 'transfer amount must be positive';
  END IF;
  IF p_debit_account = p_credit_account THEN
    RAISE EXCEPTION 'transfer accounts must differ';
  END IF;

  -- Rounded once. Every statement below reads this, so the debit and the credit
  -- cannot differ by a rounding step.
  v_amount_agorot := round(p_amount_ils * 100)::integer;
  IF v_amount_agorot <= 0 THEN
    RAISE EXCEPTION 'transfer amount rounds to zero agorot';
  END IF;

  SELECT id INTO v_existing FROM public.wallet_entries WHERE idempotency_key = p_idempotency;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- deterministic lock order prevents deadlocks
  PERFORM 1 FROM public.wallet_accounts
   WHERE id IN (p_debit_account, p_credit_account)
   ORDER BY id FOR UPDATE;

  SELECT * INTO v_debit FROM public.wallet_accounts WHERE id = p_debit_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'debit account not found';
  END IF;
  IF v_debit.user_id IS NOT NULL AND coalesce(v_debit.balance_agorot, 0) < v_amount_agorot THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  UPDATE public.wallet_accounts SET balance_agorot = coalesce(balance_agorot, 0) - v_amount_agorot
   WHERE id = p_debit_account;
  UPDATE public.wallet_accounts SET balance_agorot = coalesce(balance_agorot, 0) + v_amount_agorot
   WHERE id = p_credit_account;

  INSERT INTO public.wallet_entries
    (debit_account, credit_account, amount_agorot, reason, idempotency_key, order_id)
  VALUES
    (p_debit_account, p_credit_account, v_amount_agorot, p_reason, p_idempotency, p_order_id)
  RETURNING id INTO v_entry;

  RETURN v_entry;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. fn_wallet_transfer(uuid, uuid, numeric, wallet_reason, text, uuid, uuid, text)
--    The wallet_transactions form.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_wallet_transfer(
  p_debit_account     uuid,
  p_credit_account    uuid,
  p_amount_ils        numeric,
  p_reason            public.wallet_reason,
  p_idempotency       text,
  p_order_id          uuid DEFAULT NULL::uuid,
  p_order_item_id     uuid DEFAULT NULL::uuid,
  p_note              text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tx_id         uuid;
  v_first         uuid;
  v_second        uuid;
  v_amount_agorot integer;
BEGIN
  IF p_amount_ils IS NULL OR p_amount_ils <= 0 THEN
    RAISE EXCEPTION 'wallet transfer amount must be positive';
  END IF;
  IF p_debit_account = p_credit_account THEN
    RAISE EXCEPTION 'wallet transfer needs two distinct accounts';
  END IF;

  v_amount_agorot := round(p_amount_ils * 100)::integer;
  IF v_amount_agorot <= 0 THEN
    RAISE EXCEPTION 'wallet transfer amount rounds to zero agorot';
  END IF;

  -- Idempotent replay: return the existing tx untouched.
  SELECT id INTO v_tx_id FROM public.wallet_transactions WHERE idempotency_key = p_idempotency;
  IF v_tx_id IS NOT NULL THEN RETURN v_tx_id; END IF;

  -- Lock both accounts in a fixed global order to avoid deadlocks.
  IF p_debit_account < p_credit_account
    THEN v_first := p_debit_account;  v_second := p_credit_account;
    ELSE v_first := p_credit_account; v_second := p_debit_account;
  END IF;
  PERFORM 1 FROM public.wallet_accounts WHERE id = v_first  FOR UPDATE;
  PERFORM 1 FROM public.wallet_accounts WHERE id = v_second FOR UPDATE;

  INSERT INTO public.wallet_transactions
    (debit_account_id, credit_account_id, amount_agorot, reason,
     related_order_id, related_order_item_id, idempotency_key, note, created_by)
  VALUES
    (p_debit_account, p_credit_account, v_amount_agorot, p_reason,
     p_order_id, p_order_item_id, p_idempotency, p_note, auth.uid())
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN  -- lost a race on the same key: replay semantics
    SELECT id INTO v_tx_id FROM public.wallet_transactions WHERE idempotency_key = p_idempotency;
    RETURN v_tx_id;
  END IF;

  -- Cached balances; wallet_accounts_user_nonneg_agorot is the final
  -- double-spend floor and aborts the whole transaction on violation.
  UPDATE public.wallet_accounts SET balance_agorot = coalesce(balance_agorot, 0) - v_amount_agorot
   WHERE id = p_debit_account;
  UPDATE public.wallet_accounts SET balance_agorot = coalesce(balance_agorot, 0) + v_amount_agorot
   WHERE id = p_credit_account;

  RETURN v_tx_id;
END;
$$;
