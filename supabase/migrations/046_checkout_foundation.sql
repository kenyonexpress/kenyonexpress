-- 046_checkout_foundation.sql
-- Stripe checkout foundation: agorot/VAT snapshot columns, payment_attempts,
-- append-only order_status_audit, webhook dedupe table (idempotent).
-- Depends on: 007_orders_schema (orders), optionally 026 (payments).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Order money + Stripe correlation (agorot integers) ---------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal_agorot integer,
  ADD COLUMN IF NOT EXISTS discount_agorot integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_agorot integer,
  ADD COLUMN IF NOT EXISTS total_agorot integer,
  ADD COLUMN IF NOT EXISTS vat_rate_bps integer NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS order_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number
  ON public.orders (order_number)
  WHERE order_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_pi
  ON public.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON COLUMN public.orders.vat_rate_bps IS
  'Israeli VAT in basis points (1800 = 18%). Catalog totals are VAT-inclusive.';

-- 2. payment_attempts -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider             text NOT NULL CHECK (provider IN ('stripe', 'payoneer', 'mock', 'cardcom')),
  provider_payment_id  text,
  idempotency_key      text NOT NULL,
  amount_agorot        integer NOT NULL CHECK (amount_agorot >= 0),
  currency             text NOT NULL DEFAULT 'ILS' CHECK (currency = 'ILS'),
  status               text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled')),
  client_secret        text,
  failure_code         text,
  failure_message      text,
  raw                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempts_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_attempts_provider_payment
  ON public.payment_attempts (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order
  ON public.payment_attempts (order_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.payment_attempts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_attempts: owner select" ON public.payment_attempts;
CREATE POLICY "payment_attempts: owner select"
  ON public.payment_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_attempts.order_id
        AND o.user_id = auth.uid()
        AND o.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "payment_attempts: service all" ON public.payment_attempts;
CREATE POLICY "payment_attempts: service all"
  ON public.payment_attempts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. order_status_audit (append-only) ---------------------------------------

CREATE TABLE IF NOT EXISTS public.order_status_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  from_status       text NOT NULL,
  to_status         text NOT NULL,
  event             text NOT NULL,
  actor             text NOT NULL DEFAULT 'system',
  provider_event_id text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_audit_order
  ON public.order_status_audit (order_id, created_at DESC);

ALTER TABLE public.order_status_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_status_audit: owner select" ON public.order_status_audit;
CREATE POLICY "order_status_audit: owner select"
  ON public.order_status_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_audit.order_id
        AND o.user_id = auth.uid()
        AND o.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "order_status_audit: service insert" ON public.order_status_audit;
CREATE POLICY "order_status_audit: service insert"
  ON public.order_status_audit FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "order_status_audit: service select" ON public.order_status_audit;
CREATE POLICY "order_status_audit: service select"
  ON public.order_status_audit FOR SELECT TO service_role
  USING (true);

-- Block updates/deletes for authenticated (append-only intent)
DROP POLICY IF EXISTS "order_status_audit: no update" ON public.order_status_audit;
DROP POLICY IF EXISTS "order_status_audit: no delete" ON public.order_status_audit;

-- 4. payment_webhook_events (create if 026 not applied) ---------------------

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           text NOT NULL,
  external_event_id  text NOT NULL,
  payment_id         uuid,
  event_type         text NOT NULL,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid    boolean NOT NULL DEFAULT false,
  processed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_webhook_events_dedup UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_payment
  ON public.payment_webhook_events (payment_id);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_events: service all" ON public.payment_webhook_events;
CREATE POLICY "webhook_events: service all"
  ON public.payment_webhook_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "webhook_events: admin read" ON public.payment_webhook_events;
CREATE POLICY "webhook_events: admin read"
  ON public.payment_webhook_events FOR SELECT TO authenticated
  USING (public.is_admin());
