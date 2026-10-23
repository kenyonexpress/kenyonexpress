-- 277_fraud_monitoring.sql
--
-- FRAUD SIGNAL DETECTION AND AUTO-FLAGGING INFRASTRUCTURE
--
-- Implements continuous monitoring for fraud signals: impossible geography,
-- transaction velocity abuse, and chargeback patterns. Auto-flags suspicious
-- orders for review.
--
-- NOT APPLIED. Run preflight_277.sql first.

-- BEGIN; -- Removed to allow individual statement execution for better error messages

-- ============================================================================
-- 1. Fraud Signal Types Enum
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_signal_type') THEN
    CREATE TYPE public.fraud_signal_type AS ENUM (
      'impossible_geography',    -- user location incompatible with delivery address
      'velocity_abuse',          -- multiple orders from same IP/user too quickly
      'chargeback_risk',         -- order from profile with chargeback history
      'new_profile_high_value',  -- new account, high transaction value
      'vpn_proxy_detected'       -- user likely behind VPN/proxy
    );
  END IF;
END
$$;

-- ============================================================================
-- 2. Fraud Signal Recording Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signal_type           fraud_signal_type NOT NULL,
  severity              text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Context data captured at detection time
  user_ip               text,
  user_location_country text,    -- detected from IP
  user_location_city    text,
  delivery_country      text,    -- from order
  delivery_city         text,

  -- Metrics supporting the decision
  signal_score          numeric(4,2) NOT NULL CHECK (signal_score >= 0 AND signal_score <= 1.0),
  metadata              jsonb,   -- additional context (related orders, velocity count, etc.)

  -- Lifecycle tracking
  detected_at           timestamp with time zone NOT NULL DEFAULT now(),
  auto_flagged          boolean NOT NULL DEFAULT false,
  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_fraud_signals_order_id ON public.fraud_signals(order_id);
CREATE INDEX idx_fraud_signals_user_id ON public.fraud_signals(user_id);
CREATE INDEX idx_fraud_signals_signal_type ON public.fraud_signals(signal_type);
CREATE INDEX idx_fraud_signals_detected_at ON public.fraud_signals(detected_at DESC);
CREATE INDEX idx_fraud_signals_auto_flagged ON public.fraud_signals(auto_flagged) WHERE auto_flagged = true;

-- ============================================================================
-- 3. Fraud Flag (Flagged Orders Pending Review)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Auto-determined risk level based on signals
  risk_level            text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',

  -- Signal summary
  signal_count          integer NOT NULL DEFAULT 0,
  total_signal_score    numeric(5,2) NOT NULL DEFAULT 0.00,
  primary_signals       text[] NOT NULL DEFAULT '{}',  -- array of signal types

  -- Review lifecycle
  status                text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'manual_review')) DEFAULT 'pending',
  reviewed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           timestamp with time zone,
  review_notes          text,

  -- Action taken
  action                text CHECK (action IN ('none', 'hold', 'cancel', 'require_verification')),
  action_applied_at     timestamp with time zone,

  -- Lifecycle
  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_fraud_flags_order_id ON public.fraud_flags(order_id);
CREATE INDEX idx_fraud_flags_user_id ON public.fraud_flags(user_id);
CREATE INDEX idx_fraud_flags_status ON public.fraud_flags(status);
CREATE INDEX idx_fraud_flags_risk_level ON public.fraud_flags(risk_level);
CREATE INDEX idx_fraud_flags_created_at ON public.fraud_flags(created_at DESC);

-- ============================================================================
-- 4. Historical Chargeback Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chargeback_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Chargeback details from provider
  provider              text NOT NULL,  -- 'cardcom', etc.
  external_transaction_id text,
  amount_ils            integer NOT NULL,  -- in agorot

  -- Chargeback lifecycle
  chargeback_date       timestamp with time zone NOT NULL,
  disputed              boolean DEFAULT false,
  resolved              boolean DEFAULT false,
  resolved_date         timestamp with time zone,
  resolution_notes      text,

  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_chargeback_history_user_id ON public.chargeback_history(user_id);
CREATE INDEX idx_chargeback_history_chargeback_date ON public.chargeback_history(chargeback_date DESC);

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

-- fraud_signals: Service role can insert/read; authenticated users cannot
ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY fraud_signals_service_insert ON public.fraud_signals
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY fraud_signals_service_read ON public.fraud_signals
  FOR SELECT TO service_role
  USING (true);

-- fraud_flags: Service role can insert/read/update; authenticated users can only read if they own the order
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY fraud_flags_service_all ON public.fraud_flags
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY fraud_flags_owner_read ON public.fraud_flags
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = fraud_flags.order_id AND o.user_id = auth.uid()
    )
  );

-- chargeback_history: Service role full access; authenticated users read their own
ALTER TABLE public.chargeback_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY chargeback_history_service_all ON public.chargeback_history
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY chargeback_history_owner_read ON public.chargeback_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- 6. Helper Functions for Fraud Detection
-- ============================================================================

-- Check if order has signals and should be auto-flagged
CREATE OR REPLACE FUNCTION public.fn_should_flag_order_for_fraud(
  p_order_id uuid,
  p_signal_score numeric
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Auto-flag if signal score exceeds threshold (0.6 = medium-high risk)
  -- A single critical signal (0.9+) is also auto-flagged
  RETURN p_signal_score >= 0.60;
END;
$$;

-- Get chargeback count for a user in the last 90 days
CREATE OR REPLACE FUNCTION public.fn_profile_recent_chargebacks(
  p_user_id uuid,
  p_days integer DEFAULT 90
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.chargeback_history
  WHERE user_id = p_user_id
    AND chargeback_date > now() - (p_days || ' days')::interval
    AND resolved = false;
$$;

-- Get recent order velocity for a user (orders in last N hours)
CREATE OR REPLACE FUNCTION public.fn_profile_order_velocity(
  p_user_id uuid,
  p_hours integer DEFAULT 24
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.orders
  WHERE user_id = p_user_id
    AND created_at > now() - (p_hours || ' hours')::interval;
$$;

-- Get recent order velocity for an IP address
CREATE OR REPLACE FUNCTION public.fn_ip_order_velocity(
  p_user_ip text,
  p_hours integer DEFAULT 24
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.orders o
  LEFT JOIN public.payments p ON p.id = (
    SELECT id FROM public.payments WHERE order_id = o.id LIMIT 1
  )
  WHERE (p.payer_ip = p_user_ip OR p.client_ip = p_user_ip)
    AND o.created_at > now() - (p_hours || ' hours')::interval;
$$;

-- COMMIT; -- Removed to match BEGIN removal

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TABLE IF EXISTS public.chargeback_history CASCADE;
-- DROP TABLE IF EXISTS public.fraud_flags CASCADE;
-- DROP TABLE IF EXISTS public.fraud_signals CASCADE;
-- DROP FUNCTION IF EXISTS public.fn_ip_order_velocity(text, integer);
-- DROP FUNCTION IF EXISTS public.fn_profile_order_velocity(uuid, integer);
-- DROP FUNCTION IF EXISTS public.fn_profile_recent_chargebacks(uuid, integer);
-- DROP FUNCTION IF EXISTS public.fn_should_flag_order_for_fraud(uuid, numeric);
-- DROP TYPE IF EXISTS public.fraud_signal_type;
