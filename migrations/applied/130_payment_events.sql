-- ============================================================================
-- PENDING 120: payment_events, an append-only life history per payment
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- SUPERSEDES the withdrawn draft `006-payment-events.sql`, which covered the
-- same ground from a parallel session on this branch. Ofir chose this file on
-- 2026-08-19. Four things 006 had and this did not have been folded in rather
-- than lost: the `stage` column, `external_event_id`, `provider`, and the
-- richer event vocabulary. What was NOT taken from 006 is its `text` +
-- CHECK-constraint approach to the event type; an enum enforces the same
-- closed set, is cheaper to compare, and shows up in the generated types.
--
-- MEASURED BEFORE WRITING (2026-08-19, src/types/database.ts, the generated
-- types, which describe production; supabase/migrations/ does not):
--   payments                : exists. amount_ils, wallet_applied_ils
--                             (PRE-059 LINEAGE. There is no amount_agorot.)
--   payment_webhook_events  : exists. (provider, external_event_id) is the
--                             dedup key; processed_at is the DLQ marker.
--   audit_log               : exists, with enum audit_action. Used today for
--                             the amount-mismatch alarm.
--   There is no table named payment_events.
--
-- WHY NOT audit_log: audit_action is a closed enum of human actions
-- (created/updated/deleted/login/...). Payment lifecycle steps are neither
-- human nor closed, and widening that enum would make every audit query
-- filter payment noise out.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The event vocabulary
-- ---------------------------------------------------------------------------
-- A closed enum, not free text: an unknown event type is a bug, and a typo
-- that silently creates a new category makes the log unqueryable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_event_type') THEN
    CREATE TYPE public.payment_event_type AS ENUM (
      -- checkout, before the provider is involved
      'checkout_started',
      'order_created',
      'stock_reserved',
      'stock_reservation_failed',
      -- hosted page
      'low_profile_requested',   -- BEFORE the outbound call. Shrinks the F2 window.
      'low_profile_created',     -- Cardcom returned a page id
      'low_profile_failed',      -- Cardcom refused to create one
      'redirected',              -- customer sent to the hosted page
      -- saved-card path; there is no webhook for this at all
      'token_charge_requested',
      'token_charge_succeeded',
      'token_charge_declined',
      -- callback
      'callback_received',       -- a webhook body arrived (links the journal row)
      'callback_replay',         -- 23505 on the journal insert: Cardcom sent it twice
      'callback_rejected',       -- secret did not match
      'callback_unknown_payment',-- a Low Profile id we hold no payment for
      'callback_provider_failure',
      -- server-to-server verification: OUR finding, not the provider's statement
      'verify_requested',
      'verify_succeeded',
      'verify_failed',
      'verify_contradicted_callback',
      'amount_mismatch',         -- verified amount != our expected amount
      'amount_unreadable',
      -- closing the order
      'finalize_started',
      'finalize_succeeded',
      'finalize_replay',
      'finalize_failed',         -- F9: the worst state. Expect replays after this.
      'voucher_issued',
      'voucher_issue_refused',
      -- money going back out
      'refund_requested',
      'refund_succeeded',
      'refund_failed',
      'cancellation_fee_applied',
      'wallet_credited',
      -- out-of-band findings
      'dlq_replay_started',
      'reconciliation_matched',
      'reconciliation_missing_locally',
      'reconciliation_missing_remotely',
      'reconciliation_amount_differs'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable ON PURPOSE. 'low_profile_requested' is written before the payment
  -- row's provider fields exist, and an F2 orphan has an order but no usable
  -- payment. A NOT NULL here would drop exactly the rows this table is for.
  payment_id   uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id     uuid REFERENCES public.orders(id)   ON DELETE SET NULL,

  provider     text NOT NULL DEFAULT 'cardcom',

  event_type   public.payment_event_type NOT NULL,

  -- Mirrors the `stage` string capturePaymentAlarm already tags Sentry with
  -- ('cardcom_webhook_verify', 'cardcom_webhook_finalize', ...). Carrying the
  -- same token here is what lets an alarm in Sentry be joined to the row that
  -- caused it without anybody correlating by timestamp.
  stage        text,

  occurred_at  timestamptz NOT NULL DEFAULT now(),

  -- Correlation, so a Cardcom-side investigation can start from either end.
  low_profile_id  text,
  transaction_id  text,

  -- Ties back to payment_webhook_events when there WAS a callback. Null is
  -- meaningful: it says this event had no inbound delivery behind it, which is
  -- true of every token charge, every cron finding and every operator action.
  external_event_id text,

  -- Integer agorot or NULL. NEVER numeric, never a shekel amount: this column
  -- exists so "we asked for X, they charged Y" is greppable, and the whole
  -- point is lost if one of the two is in a different unit. See src/lib/money.ts.
  amount_agorot   bigint,

  -- Free-form context: failure codes, DLQ attempt counts, the actor who
  -- pressed refund. NOT money and NOT status.
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Who caused it. NULL means "the system" (cron, webhook, DLQ). actor_role is
  -- captured at write time rather than joined later, because a role can change
  -- and the question is always "what were they allowed to do THEN".
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role   text,

  -- Which deployment wrote it. F2's "written against a different deployment"
  -- is unanswerable today.
  environment  text,

  CONSTRAINT payment_events_amount_is_whole_agorot
    CHECK (amount_agorot IS NULL OR amount_agorot >= 0),

  -- A row with neither a payment nor an order cannot be investigated and is
  -- therefore not worth storing.
  CONSTRAINT payment_events_has_an_anchor
    CHECK (num_nulls(payment_id, order_id) < 2)
);

COMMENT ON TABLE public.payment_events IS
  'Append-only life history of a payment. NOT a source of truth for status or amount: payments is. Rows are never updated and never deleted.';
COMMENT ON COLUMN public.payment_events.amount_agorot IS
  'Integer agorot. NEVER shekels, NEVER numeric. Whole-agorot rule, src/lib/money.ts.';
COMMENT ON COLUMN public.payment_events.stage IS
  'The same stage token capturePaymentAlarm tags Sentry with, so an alarm can be joined to the row that caused it.';
COMMENT ON COLUMN public.payment_events.external_event_id IS
  'payment_webhook_events.external_event_id when this event had an inbound callback behind it. NULL means it did not, which is true of every token charge and every cron finding.';

-- ---------------------------------------------------------------------------
-- 3. Append-only, enforced by the database
-- ---------------------------------------------------------------------------
-- A convention that only the application honours is not append-only; it is a
-- hope. A trigger makes it a property.
CREATE OR REPLACE FUNCTION public.payment_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'payment_events is append-only (attempted %)', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS payment_events_no_mutation ON public.payment_events;
CREATE TRIGGER payment_events_no_mutation
  BEFORE UPDATE OR DELETE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.payment_events_append_only();

-- ---------------------------------------------------------------------------
-- 4. Indexes: the four questions actually asked
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS payment_events_payment_idx
  ON public.payment_events (payment_id, occurred_at DESC)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_events_order_idx
  ON public.payment_events (order_id, occurred_at DESC)
  WHERE order_id IS NOT NULL;

-- "Show me every finalize that failed today." Partial, because the failure
-- types are a tiny fraction of the rows and the healthy path must not pay for
-- the index.
CREATE INDEX IF NOT EXISTS payment_events_failures_idx
  ON public.payment_events (occurred_at DESC)
  WHERE event_type IN (
    'low_profile_failed','callback_rejected','callback_unknown_payment',
    'callback_provider_failure','verify_failed','verify_contradicted_callback',
    'amount_mismatch','amount_unreadable','finalize_failed',
    'voucher_issue_refused','refund_failed','token_charge_declined',
    'stock_reservation_failed','reconciliation_missing_locally',
    'reconciliation_missing_remotely','reconciliation_amount_differs'
  );

-- Correlation from the Cardcom side.
CREATE INDEX IF NOT EXISTS payment_events_low_profile_idx
  ON public.payment_events (low_profile_id)
  WHERE low_profile_id IS NOT NULL;

-- Joining a Sentry alarm to its rows.
CREATE INDEX IF NOT EXISTS payment_events_stage_idx
  ON public.payment_events (stage, occurred_at DESC)
  WHERE stage IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
-- No tenant_id anywhere in this schema. Ownership is auth.uid() and role.
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- (SELECT auth.uid()) rather than auth.uid(): the scalar subquery is evaluated
-- once as an InitPlan instead of once per row. This is the same fix commit
-- 0f8359bc applied across the schema; do not write the bare call here.
DROP POLICY IF EXISTS payment_events_owner_read ON public.payment_events;
CREATE POLICY payment_events_owner_read ON public.payment_events
  FOR SELECT TO authenticated
  USING (
    order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_events.order_id
        AND o.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS payment_events_admin_read ON public.payment_events;
CREATE POLICY payment_events_admin_read ON public.payment_events
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','super_admin','support'));

-- No INSERT policy for any client role. Writes are service-key only, from the
-- server. `anon` gets nothing: 111_revoke_anon_writes is the standing rule.
REVOKE ALL ON public.payment_events FROM anon;
GRANT SELECT ON public.payment_events TO authenticated;

-- ============================================================================
-- VERIFICATION (run after applying, inside a rolled-back DO block)
-- ============================================================================
-- 1. Append-only bites:
--      DO $$ BEGIN
--        INSERT INTO public.payment_events (order_id, event_type)
--          VALUES ((SELECT id FROM public.orders LIMIT 1), 'finalize_started');
--        UPDATE public.payment_events SET detail = '{}'::jsonb
--          WHERE event_type = 'finalize_started';
--        RAISE EXCEPTION 'rollback: the append-only trigger did not fire';
--      END $$;
--    Expect: 'payment_events is append-only (attempted UPDATE)'.
--
-- 2. The anchor constraint bites:
--      INSERT INTO public.payment_events (event_type) VALUES ('verify_failed');
--    Expect: 23514.
--
-- 3. A customer cannot read another customer's events:
--      set role authenticated; -- with a JWT for user A
--      SELECT count(*) FROM public.payment_events
--       WHERE order_id IN (SELECT id FROM public.orders WHERE user_id <> :a);
--    Expect: 0.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS payment_events_no_mutation ON public.payment_events;
--   DROP FUNCTION IF EXISTS public.payment_events_append_only();
--   DROP TABLE IF EXISTS public.payment_events;
--   DROP TYPE IF EXISTS public.payment_event_type;
-- ============================================================================
