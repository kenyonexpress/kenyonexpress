-- 215: cashback expiry — unspent cashback lapses 12 months after it was earned.
--
-- THE RULE, decided here in SQL and nowhere else (the 177 precedent:
-- TypeScript calls, the database decides): a cashback credit expires 12 months
-- after the day it landed in the wallet. Spending consumes the oldest cashback
-- first, so what expires for a user is
--
--     GREATEST(0, cashback credits older than the cutoff
--                  - every debit the wallet ever made)
--
-- capped at the account's live balance. Both sides are read off
-- wallet_entries, not cashback_ledger, so an admin clawback and a previous
-- expiry (both of which are wallet debits out of the user account) are counted
-- once and cannot be double-subtracted. Attributing every debit to the oldest
-- cashback is the customer-favourable reading; the alternative (debits consume
-- newest first) would expire more and was rejected.
--
-- WHY wallet_entries CAN CARRY THE WHOLE RULE. Every cashback credit is a
-- transfer from the single 'platform:cashback_reserve' account into the user's
-- account (order_cashback at finalize, cashback_bonus from 177, positive admin
-- adjustments), and nothing else transfers out of that reserve. Measured on
-- production 2026-09-09: the reserve exists and every entry debiting it (2 so
-- far) carries reason order_cashback.
--
-- MONEY IS INTEGER AGOROT throughout. Sums read the generated *_agorot columns
-- through to_jsonb, the same generation-agnostic trick 177 uses, and the only
-- numeric is the fn_wallet_transfer call whose contract is p_amount_ils; an
-- integer agorot value divided by 100 is exact at 2 decimals.
--
-- THE SWEEP IS IDEMPOTENT PER DAY: the ledger idempotency key carries the
-- run's UTC date, and fn_wallet_transfer is keyed on the same string, so a
-- rerun on the same day moves nothing twice. A run on a later day recomputes
-- from scratch, and the earlier expiry is a debit the formula already counts.
--
-- ALSO HERE: the wallet ledger itself becomes append-only. cashback_ledger got
-- that guard in 177 and audit_log in 149; wallet_entries, the money truth both
-- of them lean on, could still be UPDATEd by the service role. Measured before
-- writing this: no function in production and no line of app code updates or
-- deletes a wallet_entries row, and account deletion retains the table by law
-- (RETAINED_FOR_LAW), so the trigger breaks no caller.
--
-- ROLLBACK:
--   drop function public.fn_cashback_expire(integer);
--   drop trigger if exists wallet_entries_append_only on public.wallet_entries;
--   drop function public.fn_wallet_entries_block_mutation();
--   alter table public.cashback_ledger drop constraint cashback_ledger_entry_type_check;
--   alter table public.cashback_ledger add constraint cashback_ledger_entry_type_check
--     check (entry_type in ('order_item','first_purchase_bonus','fifth_purchase_bonus','admin_adjustment'));
--   alter table public.cashback_ledger drop constraint cashback_ledger_rules_positive;
--   alter table public.cashback_ledger add constraint cashback_ledger_rules_positive
--     check (entry_type = 'admin_adjustment' or amount_agorot > 0);
--   alter table public.cashback_ledger drop constraint cashback_ledger_expiry_negative;
--   (the reason check reverts the same way, from its 177 text)

-- ---------------------------------------------------------------------------
-- 1. The ledger learns the 'expiry' entry type. An expiry row is negative
--    (money leaves the wallet) and must say why, like an adjustment.
-- ---------------------------------------------------------------------------

ALTER TABLE public.cashback_ledger
  DROP CONSTRAINT IF EXISTS cashback_ledger_entry_type_check;
ALTER TABLE public.cashback_ledger
  ADD CONSTRAINT cashback_ledger_entry_type_check CHECK (entry_type IN
    ('order_item', 'first_purchase_bonus', 'fifth_purchase_bonus',
     'admin_adjustment', 'expiry'));

ALTER TABLE public.cashback_ledger
  DROP CONSTRAINT IF EXISTS cashback_ledger_rules_positive;
ALTER TABLE public.cashback_ledger
  ADD CONSTRAINT cashback_ledger_rules_positive CHECK
    (entry_type IN ('admin_adjustment', 'expiry') OR amount_agorot > 0);

ALTER TABLE public.cashback_ledger
  DROP CONSTRAINT IF EXISTS cashback_ledger_expiry_negative;
ALTER TABLE public.cashback_ledger
  ADD CONSTRAINT cashback_ledger_expiry_negative CHECK
    (entry_type <> 'expiry' OR amount_agorot < 0);

ALTER TABLE public.cashback_ledger
  DROP CONSTRAINT IF EXISTS cashback_ledger_adjustment_reason;
ALTER TABLE public.cashback_ledger
  ADD CONSTRAINT cashback_ledger_adjustment_reason CHECK
    (entry_type NOT IN ('admin_adjustment', 'expiry')
     OR (reason IS NOT NULL AND length(btrim(reason)) > 0));

-- ---------------------------------------------------------------------------
-- 2. wallet_entries goes append-only, the 149/177 stance: UPDATE and DELETE
--    raise, INSERT is the only verb, and the service role is not exempt.
--    A wrong movement is corrected by a compensating transfer, never edited.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_wallet_entries_block_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'wallet_entries is append-only; post a compensating transfer instead';
END;
$fn$;

DROP TRIGGER IF EXISTS wallet_entries_append_only ON public.wallet_entries;
CREATE TRIGGER wallet_entries_append_only
  BEFORE UPDATE OR DELETE ON public.wallet_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_wallet_entries_block_mutation();

-- ---------------------------------------------------------------------------
-- 3. The sweep. Called nightly by /api/cron/expire-cashback on the admin
--    client; caps itself at p_limit users per run so a backlog drains over
--    consecutive nights rather than in one long transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_cashback_expire(p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $fn$
DECLARE
  v_cutoff  timestamptz := now() - interval '12 months';
  v_day     text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_reserve uuid;
  rec       record;
  v_debits  bigint;
  v_balance bigint;
  v_amount  bigint;
  v_key     text;
  v_entry   uuid;
  v_swept   integer := 0;
  v_total   bigint := 0;
  v_errors  integer := 0;
BEGIN
  SELECT id INTO v_reserve FROM public.wallet_accounts
   WHERE code = 'platform:cashback_reserve';
  IF v_reserve IS NULL THEN
    -- No reserve account means no cashback was ever credited: nothing to do.
    RETURN jsonb_build_object('swept', 0, 'amount_agorot', 0, 'errors', 0);
  END IF;

  -- The picker must exclude accounts whose old cashback is already fully
  -- spent or expired: they match "has an old credit" forever, and with a bare
  -- LIMIT the same settled 200 would occupy every night's run while account
  -- 201 waits indefinitely. The debit sum is re-read under the lock below;
  -- this WHERE only decides who is worth locking.
  FOR rec IN
    SELECT c.account_id, c.user_id, c.expired_credit
      FROM (
        SELECT wa.id AS account_id, wa.user_id,
               sum(COALESCE((to_jsonb(we)->>'amount_ils_agorot')::bigint,
                            round(we.amount_ils * 100)::bigint)) AS expired_credit
          FROM public.wallet_accounts wa
          JOIN public.wallet_entries we
            ON we.credit_account = wa.id AND we.debit_account = v_reserve
         WHERE wa.user_id IS NOT NULL
           AND we.created_at <= v_cutoff
         GROUP BY wa.id, wa.user_id
      ) c
     WHERE c.expired_credit > COALESCE((
        SELECT sum(COALESCE((to_jsonb(we2)->>'amount_ils_agorot')::bigint,
                            round(we2.amount_ils * 100)::bigint))
          FROM public.wallet_entries we2
         WHERE we2.debit_account = c.account_id), 0)
     ORDER BY c.account_id
     LIMIT p_limit
  LOOP
    BEGIN
      -- Same lock the bonus takes: a sweep and a finalize on the same user
      -- serialize instead of racing the balance.
      PERFORM pg_advisory_xact_lock(
        hashtextextended('cashback_bonus:' || rec.user_id::text, 0));

      v_key := 'user:' || rec.user_id::text || ':cashback_expiry:' || v_day;
      IF EXISTS (SELECT 1 FROM public.cashback_ledger
                  WHERE idempotency_key = v_key) THEN
        CONTINUE; -- already swept today
      END IF;

      SELECT COALESCE(sum(COALESCE((to_jsonb(we)->>'amount_ils_agorot')::bigint,
                                   round(we.amount_ils * 100)::bigint)), 0)
        INTO v_debits
        FROM public.wallet_entries we
       WHERE we.debit_account = rec.account_id;

      -- FIFO: every debit ever made consumed the oldest cashback first.
      v_amount := GREATEST(0, rec.expired_credit - v_debits);

      -- Drift guard: never expire past the live balance (the running balance
      -- and the entries have disagreed before; the smaller number is the one
      -- that cannot make fn_wallet_transfer raise).
      SELECT GREATEST(0, COALESCE((to_jsonb(wa)->>'balance_ils_agorot')::bigint,
                                  round(wa.balance_ils * 100)::bigint, 0))
        INTO v_balance
        FROM public.wallet_accounts wa WHERE wa.id = rec.account_id;
      v_amount := LEAST(v_amount, v_balance);

      IF v_amount <= 0 THEN
        CONTINUE;
      END IF;

      -- One transaction per user: the transfer and its decision record commit
      -- or vanish together, both keyed on the same string.
      v_entry := public.fn_wallet_transfer(
        rec.account_id, v_reserve,
        (v_amount::numeric / 100), 'cashback_expiry', v_key, NULL);

      INSERT INTO public.cashback_ledger
        (user_id, entry_type, amount_agorot, basis_agorot,
         wallet_entry_id, idempotency_key, reason)
      VALUES
        (rec.user_id, 'expiry', -v_amount, rec.expired_credit, v_entry, v_key,
         'cashback credited on or before ' || to_char(v_cutoff, 'YYYY-MM-DD')
         || ' unspent for 12 months');

      v_swept := v_swept + 1;
      v_total := v_total + v_amount;
    EXCEPTION WHEN OTHERS THEN
      -- One user's failure must not starve the rest of the sweep. The skipped
      -- user is retried on the next run by construction.
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'swept', v_swept, 'amount_agorot', v_total, 'errors', v_errors);
END;
$fn$;

-- Service-role only, the 177 stance: the caller is the cron route on the
-- admin client. No client role has any business expiring wallets.
REVOKE ALL ON FUNCTION public.fn_cashback_expire(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cashback_expire(integer) FROM anon;
REVOKE ALL ON FUNCTION public.fn_cashback_expire(integer) FROM authenticated;
