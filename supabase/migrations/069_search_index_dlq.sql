-- ============================================================================
-- 069_search_index_dlq.sql
--
-- Dead-letter table for the search-index pipeline (ARCHITECTURE section 10).
-- QStash delivers index jobs to /api/search/index-job with retries; when every
-- retry fails, the failure callback (/api/search/index-dlq) parks the job here
-- for inspection and manual replay. This table moves no money and serves no
-- user page; it is pure operational visibility.
--
-- Idempotent: IF NOT EXISTS everywhere. Safe to run repeatedly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.search_index_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The decoded job ({op, productId, reason, enqueuedAt}), when decodable.
  job jsonb,
  -- The full QStash failure callback, verbatim. Never null: even an
  -- unparseable failure is stored as {"raw": "..."}.
  callback jsonb NOT NULL,
  last_error text,
  status text NOT NULL DEFAULT 'dead' CHECK (status IN ('dead', 'replayed', 'discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS search_index_dlq_status_created_idx
  ON public.search_index_dlq (status, created_at DESC);

-- Service-role only: no policies on purpose. RLS enabled with zero policies
-- denies anon/authenticated entirely; the admin client bypasses RLS.
ALTER TABLE public.search_index_dlq ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.search_index_dlq IS
  'Dead letters from the QStash search-index queue. Replay: POST the job to /api/search/index-job with Bearer CRON_SECRET, then set status=replayed.';
