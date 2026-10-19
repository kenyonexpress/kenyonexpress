-- P95 Latency Samples Table
-- Stores time-series p95 latency measurements per endpoint
-- Used for sustained violation detection

CREATE TABLE IF NOT EXISTS observability.p95_latency_samples (
  id bigserial PRIMARY KEY,
  endpoint_path text NOT NULL,
  method text NOT NULL,
  p95_ms integer NOT NULL,
  sample_time timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_p95_samples_endpoint_time
  ON observability.p95_latency_samples (endpoint_path, method, sample_time DESC);

CREATE INDEX IF NOT EXISTS idx_p95_samples_time
  ON observability.p95_latency_samples (sample_time DESC);

-- Enable row-level security
ALTER TABLE observability.p95_latency_samples ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow service role to insert/read/delete
CREATE POLICY IF NOT EXISTS p95_samples_service_role_all
  ON observability.p95_latency_samples
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON observability.p95_latency_samples TO service_role;
