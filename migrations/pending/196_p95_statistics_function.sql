-- P95 Statistics Function
-- Calculates min/max/avg p95 latency for a route

CREATE OR REPLACE FUNCTION observability.get_p95_stats(
  p_endpoint_path text,
  p_method text,
  p_limit_minutes integer DEFAULT 1440
)
RETURNS TABLE (
  min_ms integer,
  max_ms integer,
  avg_ms integer,
  sample_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    MIN(p95_ms)::integer as min_ms,
    MAX(p95_ms)::integer as max_ms,
    ROUND(AVG(p95_ms))::integer as avg_ms,
    COUNT(*)::integer as sample_count
  FROM observability.p95_latency_samples
  WHERE
    endpoint_path = p_endpoint_path
    AND method = p_method
    AND sample_time >= now() - (p_limit_minutes || ' minutes')::interval;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION observability.get_p95_stats TO service_role;
