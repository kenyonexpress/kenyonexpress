-- 153: the AI cost ledger.
--
-- Every agent call through src/server/ai/client.ts records its tokens, its
-- computed micro-USD cost, its latency and its outcome here, so "what is the
-- AI costing us this month" is a SELECT and not an archaeology dig through
-- provider dashboards. Until this applies, the runtime logs
-- ai.usage_not_recorded at warn and keeps working -- the ledger is an
-- observer, never a gate.
--
-- Micro-USD (integers) for the same reason money is agorot: no floats in
-- anything summed. RLS on with zero policies: service_role writes, admins
-- read through their own service-backed pages.
--
-- ROLLBACK: drop table if exists public.ai_usage;
--
-- DRY RUN, 2026-09-02, against production, rolled back: insert accepted
-- (1000 in / 500 out / 10500 micro-USD), a negative token count refused 23514.
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  agent           text NOT NULL,
  model           text NOT NULL,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  cost_usd_micros bigint  NOT NULL DEFAULT 0,
  ok              boolean NOT NULL,
  error           text,
  latency_ms      integer,
  CHECK (input_tokens >= 0 AND output_tokens >= 0 AND cost_usd_micros >= 0)
);

CREATE INDEX IF NOT EXISTS ai_usage_agent_time_idx
  ON public.ai_usage (agent, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_month_idx
  ON public.ai_usage (created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_usage IS
  'One row per AI agent call: tokens, micro-USD cost, outcome, latency. Written best-effort by src/server/ai/client.ts through the service role. RLS on, zero policies: no client role reads or writes.';
