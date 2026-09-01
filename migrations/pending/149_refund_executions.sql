-- 149: refund_executions, the money-path state machine.
--
-- STATUS: DRAFT, NOT APPLIED. Requires explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- WHY A SECOND TABLE. 131's `refunds` is the cancellation notice and its
-- adjudication (requested / approved / rejected / executing / completed).
-- This table is the money movement:
--
--   pending -> wallet_credited -> method_reversed -> completed
--
-- Wallet first so the statutory 14-day clock is met even if Cardcom is down.
-- Then the original method is reversed. Then bookkeeping closes.
--
-- THIS TABLE HOLDS NO CARDCOM TRUTH. `payments(kind=refund)` stays the
-- authority for what the provider did. This is the ordered progress of OUR
-- side of a refund that credits the wallet before the card.
--
-- Amounts are integer agorot. NEVER numeric, never shekels.
--
-- ROLLBACK
--
--   DROP TRIGGER IF EXISTS set_updated_at ON public.refund_executions;
--   DROP TABLE IF EXISTS public.refund_executions;
--   DROP TYPE  IF EXISTS public.refund_execution_state;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_execution_state') THEN
    CREATE TYPE public.refund_execution_state AS ENUM (
      'pending',
      'wallet_credited',
      'method_reversed',
      'completed'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.refund_executions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  payment_id              uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  charge_transaction_id   text NOT NULL,
  refund_transaction_id   text,
  wallet_entry_id         uuid,
  state                   public.refund_execution_state NOT NULL DEFAULT 'pending',
  amount_agorot           bigint NOT NULL,
  cancel_only             boolean NOT NULL DEFAULT false,
  idempotency_key         text NOT NULL,
  low_profile_id          text,
  wallet_credited_at      timestamptz,
  method_reversed_at      timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refund_executions_amount_positive CHECK (amount_agorot > 0),
  CONSTRAINT refund_executions_wallet_has_timestamp CHECK (
    state <> 'wallet_credited'
    AND state <> 'method_reversed'
    AND state <> 'completed'
    OR wallet_credited_at IS NOT NULL
  ),
  CONSTRAINT refund_executions_reversed_has_timestamp CHECK (
    state <> 'method_reversed' AND state <> 'completed'
    OR method_reversed_at IS NOT NULL
  ),
  CONSTRAINT refund_executions_completed_has_timestamp CHECK (
    state <> 'completed' OR completed_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS refund_executions_idempotency_key
  ON public.refund_executions (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS refund_executions_one_open_per_order
  ON public.refund_executions (order_id)
  WHERE state IN ('pending', 'wallet_credited', 'method_reversed');

CREATE INDEX IF NOT EXISTS refund_executions_order_idx
  ON public.refund_executions (order_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.refund_executions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.refund_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.refund_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_executions_owner_read ON public.refund_executions;
CREATE POLICY refund_executions_owner_read ON public.refund_executions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = refund_executions.order_id AND o.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS refund_executions_staff_read ON public.refund_executions;
CREATE POLICY refund_executions_staff_read ON public.refund_executions
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN (
    'admin'::public.user_role,
    'super_admin'::public.user_role,
    'support'::public.user_role
  ));

REVOKE ALL ON public.refund_executions FROM anon;
GRANT SELECT ON public.refund_executions TO authenticated;

COMMENT ON TABLE public.refund_executions IS
  'Money-path refund progress: pending -> wallet_credited -> method_reversed -> completed. Wallet first. payments(kind=refund) remains provider truth.';
