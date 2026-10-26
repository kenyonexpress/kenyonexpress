-- STEP 90: Observability endpoint metrics tracking
-- Stores p95, p99, error rate metrics per endpoint for SLA monitoring

CREATE TABLE IF NOT EXISTS observability.endpoint_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_path text NOT NULL,
  method text NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD')),

  -- Response time percentiles (milliseconds)
  p50_ms integer,
  p95_ms integer NOT NULL DEFAULT 300,
  p99_ms integer,

  -- Endpoint health
  total_requests bigint NOT NULL DEFAULT 0,
  error_count bigint NOT NULL DEFAULT 0,
  error_rate_percent numeric(5, 2) NOT NULL DEFAULT 0,

  -- Availability target
  sla_target_percent numeric(5, 2) NOT NULL DEFAULT 99.9,
  sla_breached boolean NOT NULL DEFAULT false,

  -- Status tracking
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'degraded', 'down')),
  last_error_at timestamp with time zone,
  last_error_message text,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  UNIQUE(endpoint_path, method)
);

CREATE TABLE observability.sla_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES observability.endpoint_metrics(id) ON DELETE CASCADE,

  -- Alert details
  alert_type text NOT NULL CHECK (alert_type IN ('p95_exceeded', 'error_rate_high', 'downtime')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),

  metric_value numeric NOT NULL,
  threshold_value numeric NOT NULL,

  -- Alert status
  triggered_at timestamp with time zone NOT NULL DEFAULT now(),
  acknowledged_at timestamp with time zone,
  resolved_at timestamp with time zone,

  notified_at timestamp with time zone,
  notification_sent boolean NOT NULL DEFAULT false,
  notification_target text DEFAULT 'ntfy.sh/kenyon-ofir-limit',

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_endpoint_metrics_status ON observability.endpoint_metrics(status);
CREATE INDEX idx_endpoint_metrics_updated ON observability.endpoint_metrics(updated_at DESC);
CREATE INDEX idx_sla_alerts_triggered ON observability.sla_alerts(triggered_at DESC);
CREATE INDEX idx_sla_alerts_unresolved ON observability.sla_alerts(resolved_at) WHERE resolved_at IS NULL;

-- Enable RLS
ALTER TABLE observability.endpoint_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE observability.sla_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies: admin-only access for writes, service role for reads
CREATE POLICY "Admin can read endpoint metrics" ON observability.endpoint_metrics
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    (SELECT is_super_admin FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can read endpoint metrics" ON observability.endpoint_metrics
  FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY "Service role can write endpoint metrics" ON observability.endpoint_metrics
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update endpoint metrics" ON observability.endpoint_metrics
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Admin can read alerts" ON observability.sla_alerts
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    (SELECT is_super_admin FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can manage alerts" ON observability.sla_alerts
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger to auto-update updated_at
CREATE TRIGGER update_endpoint_metrics_timestamp
  BEFORE UPDATE ON observability.endpoint_metrics
  FOR EACH ROW
  EXECUTE FUNCTION observability.update_timestamp();

CREATE TRIGGER update_sla_alerts_timestamp
  BEFORE UPDATE ON observability.sla_alerts
  FOR EACH ROW
  EXECUTE FUNCTION observability.update_timestamp();
