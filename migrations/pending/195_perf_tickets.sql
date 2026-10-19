-- Performance Investigation Tickets Table
-- Tracks GitHub issues created for sustained p95 violations

CREATE TABLE IF NOT EXISTS observability.perf_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_path text NOT NULL,
  method text NOT NULL,
  p95_ms integer NOT NULL,
  duration_minutes integer NOT NULL,
  github_issue_number integer,
  triggered_at timestamp with time zone NOT NULL,
  last_observed_at timestamp with time zone,
  resolved_at timestamp with time zone,
  resolution_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_perf_tickets_endpoint
  ON observability.perf_tickets (endpoint_path, method);

CREATE INDEX IF NOT EXISTS idx_perf_tickets_resolved
  ON observability.perf_tickets (resolved_at);

CREATE INDEX IF NOT EXISTS idx_perf_tickets_github
  ON observability.perf_tickets (github_issue_number);

-- Enable row-level security
ALTER TABLE observability.perf_tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow service role full access
CREATE POLICY IF NOT EXISTS perf_tickets_service_role_all
  ON observability.perf_tickets
  USING (true)
  WITH CHECK (true);

-- RLS Policy: Allow authenticated users to read
CREATE POLICY IF NOT EXISTS perf_tickets_authenticated_read
  ON observability.perf_tickets
  FOR SELECT
  USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON observability.perf_tickets TO service_role;
GRANT SELECT ON observability.perf_tickets TO authenticated;
