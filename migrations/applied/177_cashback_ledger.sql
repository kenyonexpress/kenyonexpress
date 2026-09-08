-- 177: cashback ledger: the dedicated, append-only record of every cashback
-- event, plus the two order-count bonus rules and the admin adjustment path.
--
-- WHAT EXISTED BEFORE. Per-product cashback is snapshotted on
-- order_items.cashback_amount_agorot and credited at finalize through
-- fn_wallet_transfer (reason 'order_cashback', key `order:<id>:cashback`).
-- The wallet ledger (wallet_entries) records the MOVEMENT, but nothing records
-- the cashback DECISION: which rule fired, at what rate, on what basis. This
-- table is that record. wallet_entries stays the money truth; cashback_ledger
-- is the "why", linked row-to-row through wallet_entry_id.
--
-- THE TWO NEW RULES, decided here in SQL and nowhere else (the referral
-- programme set this precedent: TypeScript calls, the database decides):
--   * first purchase        -> 10% of the order total (1000 bp)
--   * every fifth purchase  ->  5% of the order total  (500 bp)
-- The rank counts finalized orders (paid_at IS NOT NULL) per user. Rank 1 is
-- the first rule; rank 5, 10, 15, ... the second; rank 1 never double-fires.
-- Basis is the order's own total (what the customer paid on the site), read
-- generation-agnostically because the hosted DB is the pre-059 lineage
-- (total_ils numeric shekels) while the migration chain speaks agorot.
--
-- MONEY IS INTEGER AGOROT everywhere in this file. The only numeric is the
-- fn_wallet_transfer call, whose contract is p_amount_ils (089 converts once
-- on entry); an integer agorot value divided by 100 is exact at 2 decimals,
-- so no float ever rounds.
--
-- ROLLBACK:
--   drop function public.fn_cashback_admin_adjust(uuid, bigint, text, text);
--   drop function public.fn_cashback_order_bonus(uuid);
--   drop trigger if exists cashback_ledger_append_only on public.cashback_ledger;
--   drop trigger if exists audit_cashback_ledger on public.cashback_ledger;
--   drop function public.fn_cashback_ledger_block_mutation();
--   drop table public.cashback_ledger;

-- ---------------------------------------------------------------------------
-- 1. The ledger table. Append-only: no updated_at, no soft delete. A wrong
--    row is corrected by a compensating admin_adjustment row, never edited.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cashback_ledger (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id         uuid        REFERENCES public.orders(id) ON DELETE SET NULL,
  entry_type       text        NOT NULL CHECK (entry_type IN
                               ('order_item', 'first_purchase_bonus',
                                'fifth_purchase_bonus', 'admin_adjustment')),
  -- Signed integer agorot. Positive credits the customer, negative claws back
  -- (admin_adjustment only; the rule entries are always positive).
  amount_agorot    bigint      NOT NULL CHECK (amount_agorot <> 0),
  -- For rule entries: the rate applied (basis points) and what it applied to.
  -- Null on admin adjustments, which carry a reason instead.
  percent_bp       integer     CHECK (percent_bp IS NULL OR (percent_bp > 0 AND percent_bp <= 10000)),
  basis_agorot     bigint      CHECK (basis_agorot IS NULL OR basis_agorot >= 0),
  -- The wallet movement this entry explains. SET NULL rather than CASCADE:
  -- the decision record outlives any cleanup of the movement.
  wallet_entry_id  uuid        REFERENCES public.wallet_entries(id) ON DELETE SET NULL,
  idempotency_key  text        NOT NULL UNIQUE,
  reason           text,
  created_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_ledger_adjustment_reason CHECK
    (entry_type <> 'admin_adjustment' OR (reason IS NOT NULL AND length(btrim(reason)) > 0)),
  CONSTRAINT cashback_ledger_rules_positive CHECK
    (entry_type = 'admin_adjustment' OR amount_agorot > 0)
);

CREATE INDEX IF NOT EXISTS idx_cashback_ledger_user
  ON public.cashback_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashback_ledger_order
  ON public.cashback_ledger (order_id) WHERE order_id IS NOT NULL;

-- Append-only guard, same stance as the audit_log guard (149): UPDATE and
-- DELETE raise, INSERT is the only verb. The service role is not exempt:
-- a bug in app code must not be able to rewrite history either.
CREATE OR REPLACE FUNCTION public.fn_cashback_ledger_block_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'cashback_ledger is append-only; write a compensating admin_adjustment instead';
END;
$fn$;

DROP TRIGGER IF EXISTS cashback_ledger_append_only ON public.cashback_ledger;
CREATE TRIGGER cashback_ledger_append_only
  BEFORE UPDATE OR DELETE ON public.cashback_ledger
  FOR EACH ROW EXECUTE FUNCTION public.fn_cashback_ledger_block_mutation();

-- RLS: a customer reads their own history, an admin reads all of it, and no
-- client role writes anything. Both write paths are SECURITY DEFINER
-- functions below; the service role bypasses RLS as everywhere else.
ALTER TABLE public.cashback_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cashback_ledger_owner_select ON public.cashback_ledger;
CREATE POLICY cashback_ledger_owner_select ON public.cashback_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cashback_ledger_admin_select ON public.cashback_ledger;
CREATE POLICY cashback_ledger_admin_select ON public.cashback_ledger
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Audit coverage, same trail 169 gives every financial table. 169 may or may
-- not have run yet on the target DB, so attach only if its trigger function
-- exists; APPLY-ORDER runs this file after 169 in any case.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'audit_log_trigger_fn'
  ) THEN
    DROP TRIGGER IF EXISTS audit_cashback_ledger ON public.cashback_ledger;
    CREATE TRIGGER audit_cashback_ledger
      AFTER INSERT OR UPDATE OR DELETE ON public.cashback_ledger
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger_fn();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. The order-count bonus. Called by finalize after the per-item cashback
--    credit, once per order; every rule lives here, the caller decides
--    nothing. Returns the agorot awarded (0 when no rule fires or on replay).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_cashback_order_bonus(p_order_id uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $fn$
DECLARE
  v_order          jsonb;
  v_user_id        uuid;
  v_rank           bigint;
  v_bp             bigint := 0;
  v_entry_type     text;
  v_basis          bigint;
  v_amount         bigint;
  v_user_acct      uuid;
  v_reserve_acct   uuid;
  v_entry          uuid;
  v_item_entry     uuid;
  v_item_amount    bigint;
  v_key            text;
BEGIN
  SELECT to_jsonb(o) INTO v_order FROM public.orders o WHERE o.id = p_order_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;
  v_user_id := (v_order->>'user_id')::uuid;
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Serialize per user: two orders finalizing concurrently must not both
  -- count as "first". Transaction-scoped, released on commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtextextended('cashback_bonus:' || v_user_id::text, 0));

  v_key := 'order:' || p_order_id::text || ':count_bonus';
  IF EXISTS (SELECT 1 FROM public.cashback_ledger WHERE idempotency_key = v_key) THEN
    RETURN 0; -- replayed webhook / re-run finalize
  END IF;

  -- Mirror the per-item snapshot cashback into the ledger while we are here,
  -- linked to the wallet movement creditCashback already made. No money moves
  -- for this row; it is the decision record for a transfer that exists.
  SELECT w.id,
         COALESCE((to_jsonb(w)->>'amount_agorot')::bigint,
                  round(((to_jsonb(w)->>'amount_ils')::numeric) * 100)::bigint)
    INTO v_item_entry, v_item_amount
    FROM public.wallet_entries w
   WHERE w.idempotency_key = 'order:' || p_order_id::text || ':cashback';
  IF v_item_entry IS NOT NULL AND COALESCE(v_item_amount, 0) > 0 THEN
    INSERT INTO public.cashback_ledger
      (user_id, order_id, entry_type, amount_agorot, wallet_entry_id, idempotency_key)
    VALUES
      (v_user_id, p_order_id, 'order_item', v_item_amount, v_item_entry,
       'order:' || p_order_id::text || ':item_cashback')
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  -- The rank of THIS purchase: prior finalized orders plus one. paid_at is
  -- the finalize stamp; this function runs just before it is set, and the
  -- id <> p_order_id guard keeps the answer identical if a reconcile path
  -- ever calls it after the stamp.
  SELECT count(*) + 1 INTO v_rank
    FROM public.orders o
   WHERE o.user_id = v_user_id
     AND o.paid_at IS NOT NULL
     AND o.id <> p_order_id;

  IF v_rank = 1 THEN
    v_bp := 1000; v_entry_type := 'first_purchase_bonus';
  ELSIF v_rank % 5 = 0 THEN
    v_bp := 500;  v_entry_type := 'fifth_purchase_bonus';
  ELSE
    RETURN 0;
  END IF;

  -- Basis: the order total, whichever generation of column this DB has.
  v_basis := COALESCE(
    (v_order->>'total_agorot')::bigint,
    (v_order->>'total_ils_agorot')::bigint,
    round(((v_order->>'total_ils')::numeric) * 100)::bigint,
    0);
  IF v_basis <= 0 THEN
    RETURN 0; -- an order settled entirely by credit earns no cash bonus
  END IF;

  -- Integer half-up: floor((basis*bp + 5000) / 10000), non-negative operands.
  v_amount := (v_basis * v_bp + 5000) / 10000;
  IF v_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Wallet accounts, created on demand. Branch on owner_type because the two
  -- table shapes (046 slim vs 026 strict) both exist in the wild, exactly as
  -- 046 itself had to.
  SELECT id INTO v_user_acct FROM public.wallet_accounts WHERE user_id = v_user_id;
  IF v_user_acct IS NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'wallet_accounts'
                 AND column_name = 'owner_type') THEN
      EXECUTE 'INSERT INTO public.wallet_accounts (owner_type, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING'
        USING 'user', v_user_id;
    ELSE
      EXECUTE 'INSERT INTO public.wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING'
        USING v_user_id;
    END IF;
    SELECT id INTO v_user_acct FROM public.wallet_accounts WHERE user_id = v_user_id;
  END IF;

  SELECT id INTO v_reserve_acct FROM public.wallet_accounts WHERE code = 'platform:cashback_reserve';
  IF v_reserve_acct IS NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'wallet_accounts'
                 AND column_name = 'owner_type') THEN
      EXECUTE 'INSERT INTO public.wallet_accounts (owner_type, code) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING'
        USING 'platform', 'platform:cashback_reserve';
    ELSE
      EXECUTE 'INSERT INTO public.wallet_accounts (code) VALUES ($1) ON CONFLICT (code) DO NOTHING'
        USING 'platform:cashback_reserve';
    END IF;
    SELECT id INTO v_reserve_acct FROM public.wallet_accounts WHERE code = 'platform:cashback_reserve';
  END IF;

  IF v_user_acct IS NULL OR v_reserve_acct IS NULL THEN
    RAISE EXCEPTION 'wallet accounts unavailable for cashback bonus on order %', p_order_id;
  END IF;

  -- One transaction: the transfer and the ledger row commit or vanish
  -- together. The transfer is keyed on the same string, so even a caller that
  -- somehow raced past the ledger check cannot move the money twice.
  v_entry := public.fn_wallet_transfer(
    v_reserve_acct, v_user_acct,
    (v_amount::numeric / 100), 'cashback_bonus', v_key, p_order_id);

  INSERT INTO public.cashback_ledger
    (user_id, order_id, entry_type, amount_agorot, percent_bp, basis_agorot,
     wallet_entry_id, idempotency_key)
  VALUES
    (v_user_id, p_order_id, v_entry_type, v_amount, v_bp::integer, v_basis,
     v_entry, v_key);

  RETURN v_amount;
END;
$fn$;

-- Service-role only: the caller is finalize, which runs on the admin client.
-- No client role has any business awarding itself a bonus.
REVOKE ALL ON FUNCTION public.fn_cashback_order_bonus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cashback_order_bonus(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_cashback_order_bonus(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin adjustment. Signed: positive credits the customer from the
--    reserve, negative claws back into it (and fails cleanly if the customer
--    has already spent the balance; wallet_accounts_user_nonneg holds).
--    Re-checks is_admin() itself, so the app-side requireSection guard is
--    defence in depth, same stance as the payout RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_cashback_admin_adjust(
  p_user_id       uuid,
  p_amount_agorot bigint,
  p_reason        text,
  p_idempotency   text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $fn$
DECLARE
  v_user_acct    uuid;
  v_reserve_acct uuid;
  v_entry        uuid;
  v_row          uuid;
  v_key          text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_amount_agorot IS NULL OR p_amount_agorot = 0 THEN
    RAISE EXCEPTION 'adjustment amount must be non-zero';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'adjustment reason is required';
  END IF;
  IF p_idempotency IS NULL OR length(btrim(p_idempotency)) = 0 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'unknown user';
  END IF;

  v_key := 'adjust:' || p_idempotency;
  SELECT id INTO v_row FROM public.cashback_ledger WHERE idempotency_key = v_key;
  IF v_row IS NOT NULL THEN
    RETURN v_row; -- double submit: same answer, no second movement
  END IF;

  SELECT id INTO v_user_acct FROM public.wallet_accounts WHERE user_id = p_user_id;
  IF v_user_acct IS NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'wallet_accounts'
                 AND column_name = 'owner_type') THEN
      EXECUTE 'INSERT INTO public.wallet_accounts (owner_type, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING'
        USING 'user', p_user_id;
    ELSE
      EXECUTE 'INSERT INTO public.wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING'
        USING p_user_id;
    END IF;
    SELECT id INTO v_user_acct FROM public.wallet_accounts WHERE user_id = p_user_id;
  END IF;

  SELECT id INTO v_reserve_acct FROM public.wallet_accounts WHERE code = 'platform:cashback_reserve';
  IF v_reserve_acct IS NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'wallet_accounts'
                 AND column_name = 'owner_type') THEN
      EXECUTE 'INSERT INTO public.wallet_accounts (owner_type, code) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING'
        USING 'platform', 'platform:cashback_reserve';
    ELSE
      EXECUTE 'INSERT INTO public.wallet_accounts (code) VALUES ($1) ON CONFLICT (code) DO NOTHING'
        USING 'platform:cashback_reserve';
    END IF;
    SELECT id INTO v_reserve_acct FROM public.wallet_accounts WHERE code = 'platform:cashback_reserve';
  END IF;

  IF v_user_acct IS NULL OR v_reserve_acct IS NULL THEN
    RAISE EXCEPTION 'wallet accounts unavailable for cashback adjustment';
  END IF;

  IF p_amount_agorot > 0 THEN
    v_entry := public.fn_wallet_transfer(
      v_reserve_acct, v_user_acct,
      (p_amount_agorot::numeric / 100), 'cashback_adjustment', v_key, NULL);
  ELSE
    -- Clawback. fn_wallet_transfer raises on insufficient balance, which is
    -- the right refusal: money the customer already spent is not here to take.
    v_entry := public.fn_wallet_transfer(
      v_user_acct, v_reserve_acct,
      ((-p_amount_agorot)::numeric / 100), 'cashback_adjustment', v_key, NULL);
  END IF;

  INSERT INTO public.cashback_ledger
    (user_id, entry_type, amount_agorot, wallet_entry_id, idempotency_key,
     reason, created_by)
  VALUES
    (p_user_id, 'admin_adjustment', p_amount_agorot, v_entry, v_key,
     btrim(p_reason), auth.uid())
  RETURNING id INTO v_row;

  RETURN v_row;
END;
$fn$;

-- Executable by a signed-in admin (it re-checks the role itself) and by the
-- service role. Never by anon.
REVOKE ALL ON FUNCTION public.fn_cashback_admin_adjust(uuid, bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cashback_admin_adjust(uuid, bigint, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_cashback_admin_adjust(uuid, bigint, text, text) TO authenticated;
