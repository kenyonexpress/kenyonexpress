-- ============================================================================
-- C16: Payment Events + Refunds + Search Index Outbox + State Guards
-- ============================================================================
-- CONSOLIDATED MIGRATION bringing together payment tracking, refund management,
-- search indexing, and state transition guards. All components use IF NOT EXISTS
-- guards for idempotency.
--
-- COMPONENTS:
--   1. payment_events table (from 130)
--   2. refunds table (from 131)
--   3. search_index_outbox table (from 132)
--   4. State guards on orders.status, payments.status (from 137)
--
-- STATUS: PENDING. Requires MCP apply_migration. Never `db push`.
-- ============================================================================

-- ===========================================================================
-- 1. PAYMENT EVENTS - Append-only payment lifecycle journal
-- ===========================================================================

-- Event vocabulary enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_event_type') THEN
    CREATE TYPE public.payment_event_type AS ENUM (
      'checkout_started',
      'order_created',
      'stock_reserved',
      'stock_reservation_failed',
      'low_profile_requested',
      'low_profile_created',
      'low_profile_failed',
      'redirected',
      'token_charge_requested',
      'token_charge_succeeded',
      'token_charge_declined',
      'callback_received',
      'callback_replay',
      'callback_rejected',
      'callback_unknown_payment',
      'callback_provider_failure',
      'verify_requested',
      'verify_succeeded',
      'verify_failed',
      'verify_contradicted_callback',
      'amount_mismatch',
      'amount_unreadable',
      'finalize_started',
      'finalize_succeeded',
      'finalize_replay',
      'finalize_failed',
      'voucher_issued',
      'voucher_issue_refused',
      'refund_requested',
      'refund_succeeded',
      'refund_failed',
      'cancellation_fee_applied',
      'wallet_credited',
      'dlq_replay_started',
      'reconciliation_matched',
      'reconciliation_missing_locally',
      'reconciliation_missing_remotely',
      'reconciliation_amount_differs'
    );
  END IF;
END
$$;

-- Payment events table
CREATE TABLE IF NOT EXISTS public.payment_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        public.payment_event_type NOT NULL,
  stage             text,
  payment_id        uuid,
  order_id          uuid,
  low_profile_id    text,
  transaction_id    text,
  external_event_id text,
  amount_agorot     bigint,
  detail            jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id          uuid,
  actor_role        text,
  environment       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Unique index on external_event_id for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_external_event_id_key
  ON public.payment_events (external_event_id)
  WHERE external_event_id IS NOT NULL;

-- Index for payment timeline queries
CREATE INDEX IF NOT EXISTS payment_events_payment_id_created_at_idx
  ON public.payment_events (payment_id, created_at DESC)
  WHERE payment_id IS NOT NULL;

-- Index for order timeline queries
CREATE INDEX IF NOT EXISTS payment_events_order_id_created_at_idx
  ON public.payment_events (order_id, created_at DESC)
  WHERE order_id IS NOT NULL;

-- RLS: service-role only
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_events FROM anon, authenticated;

COMMENT ON TABLE public.payment_events IS
  'Append-only payment lifecycle journal. Written by src/server/payments/payment-events.ts';
COMMENT ON COLUMN public.payment_events.external_event_id IS
  'Provider event ID for deduplication. Unique constraint detects replays.';
COMMENT ON COLUMN public.payment_events.amount_agorot IS
  'Integer agorot only, never shekels. See src/lib/money.ts';

-- ===========================================================================
-- 2. REFUNDS - Statutory cancellation record
-- ===========================================================================

-- Refund ground enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_ground') THEN
    CREATE TYPE public.refund_ground AS ENUM (
      'distance_sale_14d',
      'defect',
      'service_not_provided',
      'duplicate_charge',
      'extended_window',
      'goodwill'
    );
  END IF;
END
$$;

-- Refund state enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_state') THEN
    CREATE TYPE public.refund_state AS ENUM (
      'requested',
      'approved',
      'rejected',
      'executing',
      'completed',
      'failed'
    );
  END IF;
END
$$;

-- Refund destination enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_destination') THEN
    CREATE TYPE public.refund_destination AS ENUM (
      'original_method',
      'wallet'
    );
  END IF;
END
$$;

-- Refunds table
CREATE TABLE IF NOT EXISTS public.refunds (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                uuid NOT NULL,
  payment_id              uuid,
  state                   public.refund_state NOT NULL DEFAULT 'requested',
  ground                  public.refund_ground NOT NULL,
  destination             public.refund_destination NOT NULL DEFAULT 'original_method',

  requested_at            timestamptz NOT NULL DEFAULT now(),
  decided_at              timestamptz,
  completed_at            timestamptz,
  refund_due_by           timestamptz,

  requested_by            uuid,
  decided_by              uuid,

  requested_agorot        bigint NOT NULL,
  cancellation_fee_agorot bigint NOT NULL DEFAULT 0,
  granted_agorot          bigint,

  cancel_only             boolean NOT NULL DEFAULT false,
  reason_he               text NOT NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS refunds_order_id_idx
  ON public.refunds (order_id);
CREATE INDEX IF NOT EXISTS refunds_payment_id_idx
  ON public.refunds (payment_id)
  WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS refunds_state_requested_at_idx
  ON public.refunds (state, requested_at);
CREATE INDEX IF NOT EXISTS refunds_due_soon_idx
  ON public.refunds (refund_due_by)
  WHERE state NOT IN ('completed', 'rejected', 'failed');

-- Constraints
ALTER TABLE public.refunds
  ADD CONSTRAINT IF NOT EXISTS refunds_wallet_has_no_fee
    CHECK (destination != 'wallet' OR cancellation_fee_agorot = 0);

ALTER TABLE public.refunds
  ADD CONSTRAINT IF NOT EXISTS refunds_granted_le_requested
    CHECK (granted_agorot IS NULL OR granted_agorot <= requested_agorot);

ALTER TABLE public.refunds
  ADD CONSTRAINT IF NOT EXISTS refunds_fee_le_5pct_capped_100
    CHECK (cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000));

-- Trigger to enforce 14-day deadline (Consumer Protection Law 14ה)
CREATE OR REPLACE FUNCTION public.fn_refunds_force_due_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.refund_due_by := NEW.requested_at + interval '14 days';
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_refunds_force_due_by ON public.refunds;
CREATE TRIGGER tg_refunds_force_due_by
  BEFORE INSERT OR UPDATE OF requested_at ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.fn_refunds_force_due_by();

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION public.fn_refunds_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_refunds_set_updated_at ON public.refunds;
CREATE TRIGGER tg_refunds_set_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.fn_refunds_set_updated_at();

-- RLS: service-role only
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.refunds FROM anon, authenticated;

COMMENT ON TABLE public.refunds IS
  'Statutory refund records. Written by src/server/payments/refund-record.ts';
COMMENT ON COLUMN public.refunds.refund_due_by IS
  '14 days from requested_at per Consumer Protection Law 14ה. Enforced by trigger.';
COMMENT ON COLUMN public.refunds.requested_agorot IS
  'Integer agorot only. See src/lib/money.ts';

-- ===========================================================================
-- 3. SEARCH INDEX OUTBOX - Durable search reindex queue
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.search_index_outbox (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  uuid NOT NULL,
  op          text NOT NULL CHECK (op IN ('upsert','delete')),

  enqueued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz,
  done_at     timestamptz,

  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  next_try_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS search_index_outbox_pending_idx
  ON public.search_index_outbox (COALESCE(next_try_at, enqueued_at))
  WHERE done_at IS NULL;

CREATE INDEX IF NOT EXISTS search_index_outbox_product_idx
  ON public.search_index_outbox (product_id)
  WHERE done_at IS NULL;

-- Enqueue trigger
CREATE OR REPLACE FUNCTION public.fn_enqueue_search_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.search_index_outbox (product_id, op)
      VALUES (OLD.id, 'delete');
    RETURN OLD;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR NEW.status <> 'active' THEN
    INSERT INTO public.search_index_outbox (product_id, op)
      VALUES (NEW.id, 'delete');
  ELSE
    INSERT INTO public.search_index_outbox (product_id, op)
      VALUES (NEW.id, 'upsert');
  END IF;
  RETURN NEW;
END
$$;

-- Only create trigger if products table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products') THEN
    DROP TRIGGER IF EXISTS tg_products_enqueue_search_index ON public.products;
    CREATE TRIGGER tg_products_enqueue_search_index
      AFTER INSERT OR UPDATE OR DELETE ON public.products
      FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_search_index();
  END IF;
END
$$;

-- Claim function
CREATE OR REPLACE FUNCTION public.fn_claim_search_index_jobs(p_limit integer DEFAULT 50)
RETURNS SETOF public.search_index_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.search_index_outbox o
     SET claimed_at = now(),
         attempts   = o.attempts + 1
   WHERE o.id IN (
     SELECT id FROM public.search_index_outbox
      WHERE done_at IS NULL
        AND COALESCE(next_try_at, enqueued_at) <= now()
      ORDER BY COALESCE(next_try_at, enqueued_at)
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_search_index_jobs(integer) FROM PUBLIC, anon, authenticated;

-- RLS: service-role only
ALTER TABLE public.search_index_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_index_outbox FROM anon, authenticated;

COMMENT ON TABLE public.search_index_outbox IS
  'Durable record that a product needs reindexing. Webhook is fast path; this is floor under it.';
COMMENT ON COLUMN public.search_index_outbox.product_id IS
  'Intentionally NOT a foreign key: deleted product still owes a delete job.';

-- ===========================================================================
-- 4. STATE GUARDS - Prevent invalid status transitions
-- ===========================================================================

-- Orders status guard
CREATE OR REPLACE FUNCTION public.fn_orders_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status IS NULL OR OLD.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status::text, NEW.status::text) IN (
    ('fulfilled','platform_settled'),
    ('fulfilled','refunded'),
    ('paid','fulfilled'),
    ('paid','partially_fulfilled'),
    ('paid','platform_settled'),
    ('paid','refunded'),
    ('partially_fulfilled','fulfilled'),
    ('partially_fulfilled','refunded'),
    ('pending','cancelled'),
    ('pending','paid'),
    ('platform_settled','refunded')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal orders.status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END
$$;

-- Only create trigger if orders table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
    DROP TRIGGER IF EXISTS tg_orders_status_guard ON public.orders;
    CREATE TRIGGER tg_orders_status_guard
      BEFORE UPDATE ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.fn_orders_status_guard();
  END IF;
END
$$;

-- Payments status guard
CREATE OR REPLACE FUNCTION public.fn_payments_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status IS NULL OR OLD.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status::text, NEW.status::text) IN (
    ('initiated','failed'),
    ('initiated','redirected'),
    ('initiated','succeeded'),
    ('platform_settled','refunded'),
    ('redirected','failed'),
    ('redirected','succeeded'),
    ('succeeded','platform_settled'),
    ('succeeded','refunded')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal payments.status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END
$$;

-- Only create trigger if payments table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payments') THEN
    DROP TRIGGER IF EXISTS tg_payments_status_guard ON public.payments;
    CREATE TRIGGER tg_payments_status_guard
      BEFORE UPDATE ON public.payments
      FOR EACH ROW EXECUTE FUNCTION public.fn_payments_status_guard();
  END IF;
END
$$;

-- Order items settlement status guard
CREATE OR REPLACE FUNCTION public.fn_order_items_settlement_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.settlement_status IS NULL OR OLD.settlement_status IS NULL OR NEW.settlement_status = OLD.settlement_status THEN
    RETURN NEW;
  END IF;

  IF (OLD.settlement_status::text, NEW.settlement_status::text) IN (
    ('escrow_held','escrow_released'),
    ('escrow_held','redeemed'),
    ('escrow_held','refunded'),
    ('escrow_released','redeemed'),
    ('escrow_released','refunded'),
    ('paid','cancelled'),
    ('paid','platform_settled'),
    ('paid','redeemed'),
    ('paid','refunded'),
    ('paid','split_executed'),
    ('pending','cancelled'),
    ('pending','paid'),
    ('pending','refunded'),
    ('pending','split_executed'),
    ('platform_settled','redeemed'),
    ('platform_settled','refunded'),
    ('split_executed','redeemed'),
    ('split_executed','refunded')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal order_items.settlement_status transition: % -> %', OLD.settlement_status, NEW.settlement_status
    USING ERRCODE = '23514';
END
$$;

-- Only create trigger if order_items table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_items') THEN
    DROP TRIGGER IF EXISTS tg_order_items_settlement_status_guard ON public.order_items;
    CREATE TRIGGER tg_order_items_settlement_status_guard
      BEFORE UPDATE ON public.order_items
      FOR EACH ROW EXECUTE FUNCTION public.fn_order_items_settlement_status_guard();
  END IF;
END
$$;

-- ===========================================================================
-- ROLLBACK (for testing)
-- ===========================================================================
-- DROP TRIGGER IF EXISTS tg_order_items_settlement_status_guard ON public.order_items;
-- DROP TRIGGER IF EXISTS tg_payments_status_guard ON public.payments;
-- DROP TRIGGER IF EXISTS tg_orders_status_guard ON public.orders;
-- DROP FUNCTION IF EXISTS public.fn_order_items_settlement_status_guard();
-- DROP FUNCTION IF EXISTS public.fn_payments_status_guard();
-- DROP FUNCTION IF EXISTS public.fn_orders_status_guard();
-- DROP FUNCTION IF EXISTS public.fn_claim_search_index_jobs(integer);
-- DROP TRIGGER IF EXISTS tg_products_enqueue_search_index ON public.products;
-- DROP FUNCTION IF EXISTS public.fn_enqueue_search_index();
-- DROP TABLE IF EXISTS public.search_index_outbox;
-- DROP TRIGGER IF EXISTS tg_refunds_set_updated_at ON public.refunds;
-- DROP TRIGGER IF EXISTS tg_refunds_force_due_by ON public.refunds;
-- DROP FUNCTION IF EXISTS public.fn_refunds_set_updated_at();
-- DROP FUNCTION IF EXISTS public.fn_refunds_force_due_by();
-- DROP TABLE IF EXISTS public.refunds;
-- DROP TYPE IF EXISTS public.refund_destination;
-- DROP TYPE IF EXISTS public.refund_state;
-- DROP TYPE IF EXISTS public.refund_ground;
-- DROP TABLE IF EXISTS public.payment_events;
-- DROP TYPE IF EXISTS public.payment_event_type;
-- ===========================================================================
