-- 075_cardcom_account_id.sql
--
-- Multi-account Cardcom needs one thing from the database: every artefact must
-- remember which terminal produced it.
--
-- Cardcom scopes both Low Profile ids and card tokens to the terminal that
-- created them. A GetLpResult sent to the wrong terminal answers "not found",
-- and the webhook reads that as "the payment did not happen" for a customer who
-- was in fact charged. A token charge sent to the wrong terminal is declined.
-- Neither failure looks like a configuration error from the outside, which is
-- why the account id is stored rather than re-derived.
--
-- NULL means the platform account. Every row written before this migration was
-- cleared on the platform terminal, so NULL is the correct reading of history
-- and not an unknown. `getPaymentProvider(null)` resolves to platform for the
-- same reason.
--
-- Additive and reversible: two nullable text columns and two partial indexes.
-- No existing value is touched and no code is required to set them.
--
-- Idempotent, forward-only. Depends on: 001 (payments), 046 (payment_tokens).

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS cardcom_account_id text;

ALTER TABLE public.payment_tokens
  ADD COLUMN IF NOT EXISTS cardcom_account_id text;

COMMENT ON COLUMN public.payments.cardcom_account_id IS
  'Which configured Cardcom account cleared this payment, matching an id in the CARDCOM_ACCOUNTS registry. NULL means the platform account (the merchant of record). Read back when re-verifying via GetLpResult and when refunding: both calls must reach the terminal that owns the transaction.';

COMMENT ON COLUMN public.payment_tokens.cardcom_account_id IS
  'The account whose terminal issued this token. A token cannot be charged on any other terminal, so a saved card is only offered for a checkout that clears on the same account. NULL means the platform account.';

-- Only non-platform rows are worth indexing: the platform account is the
-- overwhelming majority and NULL is its marker, so a full index would be a
-- near-copy of the table for no benefit. These serve reconciliation queries
-- that ask "what did account X clear".
CREATE INDEX IF NOT EXISTS payments_cardcom_account_idx
  ON public.payments (cardcom_account_id, created_at DESC)
  WHERE cardcom_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_tokens_cardcom_account_idx
  ON public.payment_tokens (cardcom_account_id)
  WHERE cardcom_account_id IS NOT NULL;

-- An empty string would be a third meaning for "platform" alongside NULL and
-- the literal 'platform', and the one that no code checks for.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname = 'payments_cardcom_account_id_not_blank'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_cardcom_account_id_not_blank
      CHECK (cardcom_account_id IS NULL OR length(btrim(cardcom_account_id)) > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payment_tokens'::regclass
      AND conname = 'payment_tokens_cardcom_account_id_not_blank'
  ) THEN
    ALTER TABLE public.payment_tokens
      ADD CONSTRAINT payment_tokens_cardcom_account_id_not_blank
      CHECK (cardcom_account_id IS NULL OR length(btrim(cardcom_account_id)) > 0);
  END IF;
END $$;
