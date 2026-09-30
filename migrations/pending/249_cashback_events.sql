-- 249_cashback_events.sql
--
-- The cashback wallet's event ledger, in the shape STEP 13 asks for
-- (order_id, agorot, reason, created_at), plus the checkout redemption floor
-- (STEP 13, 01.10).
--
-- MEASURED BEFORE WRITING. `grep -rn cashback_events src migrations supabase`
-- found nothing on 2026-10-01. What DOES exist, and is applied on production
-- (cashback_ledger_177, verified in pg_class on 2026-09), is
-- `public.cashback_ledger` (177): append-only, one row per cashback DECISION
-- (which rule fired, at what rate, on what basis, linked to the wallet
-- movement), with the two order-count rules decided in SQL by
-- `fn_cashback_order_bonus`: 10% of the order total on the first finalized
-- purchase, 5% on every fifth. 215 added the twelve-month expiry.
--
-- WHY A VIEW AND NOT A SECOND TABLE. A second ledger with the same rows
-- under a second name is a second source of truth, and the one certain
-- thing about two ledgers is that they drift. `cashback_events` is therefore
-- a VIEW over `cashback_ledger` that renames the columns to the requested
-- vocabulary: `amount_agorot` -> `agorot`, `entry_type` -> `reason`. The
-- ledger's free-text note (`cashback_ledger.reason`, required on admin
-- adjustments) is exposed as `note` so nothing is lost. Money stays integer
-- agorot end to end: the view carries the bigint through unchanged.
--
-- RLS. `security_invoker = true` (the 103 rule for every view here), so the
-- SELECT runs as the caller and 177's policies decide the rows: an
-- authenticated customer sees their own events, an admin sees all, anon
-- sees nothing. There is no anon grant on the view and no policy of its own.
-- It is read-only by construction: 177's append-only trigger refuses UPDATE
-- and DELETE on the base table for every role, and nothing grants INSERT.
--
-- THE REDEMPTION FLOOR IS NOT HERE. "Redeem in checkout, minimum ₪10" is a
-- rule about what the checkout may POST, enforced in
-- `src/lib/cashback/redemption.ts` (MIN_WALLET_REDEMPTION_AGOROT = 1000),
-- in the zod schema and in `beginCheckout`. It is not a CHECK on the orders
-- table because the wallet column on the hosted lineage is
-- `cashback_applied_ils` (numeric shekels) and a constraint there would
-- have to be written per generation; and because refunds and admin
-- adjustments legitimately move amounts under the floor.
--
-- ROLLBACK:
--   drop view if exists public.cashback_events;

DO $$
BEGIN
  IF to_regclass('public.cashback_ledger') IS NULL THEN
    RAISE EXCEPTION '249 requires cashback_ledger (177); apply 177 first';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.cashback_events
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.user_id,
  l.order_id,
  l.amount_agorot   AS agorot,
  l.entry_type      AS reason,
  l.reason          AS note,
  l.percent_bp,
  l.basis_agorot,
  l.created_at
FROM public.cashback_ledger l;

COMMENT ON VIEW public.cashback_events IS
  'STEP 13 cashback wallet ledger: one row per cashback event, integer agorot, '
  'reason = 177 entry_type (order_item | first_purchase_bonus | fifth_purchase_bonus | admin_adjustment). '
  'security_invoker view over cashback_ledger; RLS of the base table applies.';

REVOKE ALL ON public.cashback_events FROM PUBLIC;
REVOKE ALL ON public.cashback_events FROM anon;
GRANT SELECT ON public.cashback_events TO authenticated;
GRANT SELECT ON public.cashback_events TO service_role;

-- Self-check: the four columns the step names exist with the types the
-- money path expects, and anon holds nothing.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
    FROM unnest(ARRAY['order_id', 'agorot', 'reason', 'created_at']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cashback_events' AND column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'cashback_events is missing: %', v_missing;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'cashback_events' AND column_name = 'agorot')
     <> 'bigint' THEN
    RAISE EXCEPTION 'cashback_events.agorot must be bigint (integer agorot)';
  END IF;

  IF has_table_privilege('anon', 'public.cashback_events', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not read cashback_events';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
