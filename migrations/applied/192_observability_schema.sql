-- STEP 90: Create observability schema and utility functions

CREATE SCHEMA IF NOT EXISTS observability;

-- Endpoint metrics table (moved from 193 to fix dependency order)
CREATE TABLE IF NOT EXISTS observability.endpoint_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_path text NOT NULL,
  method text NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD')),
  p50_ms integer,
  p95_ms integer NOT NULL DEFAULT 300,
  p99_ms integer,
  total_requests bigint NOT NULL DEFAULT 0,
  error_count bigint NOT NULL DEFAULT 0,
  error_rate_percent numeric(5, 2) NOT NULL DEFAULT 0,
  sla_target_percent numeric(5, 2) NOT NULL DEFAULT 99.9,
  sla_breached boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'degraded', 'down')),
  last_error_at timestamp with time zone,
  last_error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (endpoint_path, method)
);

-- Update timestamp helper function
CREATE OR REPLACE FUNCTION observability.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to record endpoint metrics from API calls
CREATE OR REPLACE FUNCTION observability.record_endpoint_hit(
  p_endpoint_path text,
  p_method text,
  p_response_time_ms integer,
  p_status_code integer
) RETURNS uuid AS $$
DECLARE
  v_metric_id uuid;
  v_is_error boolean;
BEGIN
  v_is_error := p_status_code >= 400;

  INSERT INTO observability.endpoint_metrics (
    endpoint_path,
    method,
    p95_ms,
    total_requests,
    error_count,
    status,
    last_error_at,
    last_error_message
  ) VALUES (
    p_endpoint_path,
    p_method,
    p_response_time_ms,
    1,
    CASE WHEN v_is_error THEN 1 ELSE 0 END,
    CASE WHEN v_is_error THEN 'degraded' ELSE 'ok' END,
    CASE WHEN v_is_error THEN now() ELSE NULL END,
    CASE WHEN v_is_error THEN 'HTTP ' || p_status_code ELSE NULL END
  )
  ON CONFLICT (endpoint_path, method) DO UPDATE SET
    total_requests = observability.endpoint_metrics.total_requests + 1,
    error_count = observability.endpoint_metrics.error_count + (CASE WHEN v_is_error THEN 1 ELSE 0 END),
    p95_ms = GREATEST(observability.endpoint_metrics.p95_ms, p_response_time_ms),
    last_error_at = CASE WHEN v_is_error THEN now() ELSE observability.endpoint_metrics.last_error_at END,
    last_error_message = CASE WHEN v_is_error THEN 'HTTP ' || p_status_code ELSE observability.endpoint_metrics.last_error_message END,
    updated_at = now()
  RETURNING id INTO v_metric_id;

  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and trigger SLA alerts
CREATE OR REPLACE FUNCTION observability.check_sla_breach(
  p_metric_id uuid
) RETURNS boolean AS $$
DECLARE
  v_metric observability.endpoint_metrics%ROWTYPE;
  v_should_alert boolean := false;
BEGIN
  SELECT * INTO v_metric FROM observability.endpoint_metrics WHERE id = p_metric_id;

  IF v_metric IS NULL THEN
    RETURN false;
  END IF;

  -- Check if p95 exceeds target
  IF v_metric.p95_ms > v_metric.sla_target_percent * 10 THEN
    v_should_alert := true;
  END IF;

  -- Check if error rate exceeds 0.1% (complement of 99.9% SLA)
  v_metric.error_rate_percent := CASE
    WHEN v_metric.total_requests > 0
    THEN (v_metric.error_count::numeric / v_metric.total_requests * 100)
    ELSE 0
  END;

  IF v_metric.error_rate_percent > (100 - v_metric.sla_target_percent) THEN
    v_should_alert := true;
  END IF;

  -- Update SLA breach status
  UPDATE observability.endpoint_metrics
  SET sla_breached = v_should_alert, error_rate_percent = v_metric.error_rate_percent
  WHERE id = p_metric_id;

  RETURN v_should_alert;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
