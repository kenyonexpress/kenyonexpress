-- Migration 028: AI Agents infrastructure (DRAFT - DO NOT APPLY YET)
-- Design: docs/AI-AGENTS-ARCHITECTURE.md
-- Shared foundation for internal agents: shopping, supplier_ops, support,
-- fraud_watch. Prompt versioning, run logging, fraud review queue, listing
-- drafts, escalations. No dependency on 026/027 drafts.
-- Prerequisites on the live DB: 019 (user_rate_limits), 025 (audit_log_trigger_fn).
-- Fully idempotent. Apply only via MCP apply_migration.

-- Defensive: 001 may have stopped early on a live DB before defining this function.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ===========================================================================
-- 1. ENUMs
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE public.agent_key AS ENUM ('shopping', 'supplier_ops', 'support', 'fraud_watch');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.agent_run_status AS ENUM ('running', 'succeeded', 'failed', 'escalated', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.agent_flag_status AS ENUM ('open', 'reviewing', 'confirmed', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.listing_draft_status AS ENUM ('draft', 'pending_admin', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.escalation_status AS ENUM ('open', 'in_progress', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 2. agent_prompts (prompt versioning; exactly one active version per agent)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agent_prompts (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key         public.agent_key  NOT NULL,
  version           int               NOT NULL CHECK (version > 0),
  system_prompt     text              NOT NULL,
  model             text              NOT NULL DEFAULT 'claude-opus-4-8',
  effort            text              NOT NULL DEFAULT 'high'
                      CHECK (effort IN ('low', 'medium', 'high', 'xhigh', 'max')),
  tools_config      jsonb             NOT NULL DEFAULT '{}'::jsonb,
  max_output_tokens int               NOT NULL DEFAULT 2048 CHECK (max_output_tokens BETWEEN 256 AND 64000),
  max_tool_steps    int               NOT NULL DEFAULT 6 CHECK (max_tool_steps BETWEEN 1 AND 20),
  is_active         boolean           NOT NULL DEFAULT false,
  notes             text,
  created_by        uuid              REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz       NOT NULL DEFAULT now(),
  updated_at        timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT agent_prompts_key_version_key UNIQUE (agent_key, version)
);

-- One active version per agent (the kill switch: flip is_active off)
CREATE UNIQUE INDEX IF NOT EXISTS agent_prompts_one_active_idx
  ON public.agent_prompts (agent_key) WHERE is_active = true;

DROP TRIGGER IF EXISTS set_updated_at ON public.agent_prompts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.agent_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 3. agent_runs + agent_run_steps
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id                 uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key          public.agent_key        NOT NULL,
  prompt_id          uuid                    REFERENCES public.agent_prompts(id) ON DELETE SET NULL,
  status             public.agent_run_status NOT NULL DEFAULT 'running',
  user_id            uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  supplier_id        uuid                    REFERENCES public.suppliers(id) ON DELETE SET NULL,
  session_key        text,                   -- anonymous chat session cookie id
  trigger            text                    NOT NULL DEFAULT 'chat'
                       CHECK (trigger IN ('chat', 'form', 'cron', 'admin')),
  input_summary      text,
  output_summary     text,
  tool_steps         int                     NOT NULL DEFAULT 0,
  input_tokens       int                     NOT NULL DEFAULT 0,
  output_tokens      int                     NOT NULL DEFAULT 0,
  cache_read_tokens  int                     NOT NULL DEFAULT 0,
  cost_usd           numeric(10,6)           NOT NULL DEFAULT 0,
  latency_ms         int,
  error              text,
  created_at         timestamptz             NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS agent_runs_key_created_idx ON public.agent_runs (agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_user_idx        ON public.agent_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_supplier_idx    ON public.agent_runs (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx      ON public.agent_runs (status) WHERE status IN ('running', 'failed');

-- Append-only step log; one row per tool call (redacted input, summarized output)
CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid        NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  seq            int         NOT NULL CHECK (seq >= 1),
  tool_name      text        NOT NULL,
  input_redacted jsonb       NOT NULL DEFAULT '{}'::jsonb,
  output_summary text,
  is_error       boolean     NOT NULL DEFAULT false,
  duration_ms    int,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_run_steps_run_seq_key UNIQUE (run_id, seq)
);

CREATE INDEX IF NOT EXISTS agent_run_steps_run_idx ON public.agent_run_steps (run_id, seq);

-- ===========================================================================
-- 4. agent_flags (fraud watch review queue; never blocks autonomously)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agent_flags (
  id           uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid                     REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  kind         text                     NOT NULL,  -- e.g. 'scan_velocity', 'wallet_pattern', 'refund_abuse', 'wrong_supplier_burst'
  entity_type  text                     NOT NULL,  -- 'user' | 'supplier' | 'coupon_code' | 'order'
  entity_id    uuid                     NOT NULL,
  severity     text                     NOT NULL DEFAULT 'medium'
                 CHECK (severity IN ('low', 'medium', 'high')),
  summary_he   text                     NOT NULL,  -- human-readable explanation for the admin
  evidence     jsonb                    NOT NULL DEFAULT '{}'::jsonb,  -- detector numbers, time windows
  status       public.agent_flag_status NOT NULL DEFAULT 'open',
  reviewed_by  uuid                     REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz              NOT NULL DEFAULT now(),
  updated_at   timestamptz              NOT NULL DEFAULT now()
);

-- Dedup: one live flag per (kind, entity); detectors update evidence instead
CREATE UNIQUE INDEX IF NOT EXISTS agent_flags_live_dedup_idx
  ON public.agent_flags (kind, entity_type, entity_id)
  WHERE status IN ('open', 'reviewing');

CREATE INDEX IF NOT EXISTS agent_flags_status_idx ON public.agent_flags (status, severity, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.agent_flags;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.agent_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 5. listing_drafts (supplier_ops output; admin approves before publish)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.listing_drafts (
  id                         uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id                uuid                        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  created_by                 uuid                        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  run_id                     uuid                        REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  source_text                text,
  source_image_urls          text[]                      NOT NULL DEFAULT '{}',
  draft                      jsonb                       NOT NULL,  -- structured product fields (title_he, description_he, category_id, ...)
  suggested_platform_percent numeric(5,2)                CHECK (suggested_platform_percent BETWEEN 0 AND 100),
  benchmark                  jsonb                       NOT NULL DEFAULT '{}'::jsonb,  -- category aggregate the suggestion was based on
  gaps                       jsonb                       NOT NULL DEFAULT '[]'::jsonb,  -- what the agent flagged as missing
  status                     public.listing_draft_status NOT NULL DEFAULT 'draft',
  admin_note                 text,
  reviewed_by                uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at                timestamptz,
  published_product_id       uuid                        REFERENCES public.products(id) ON DELETE SET NULL,
  created_at                 timestamptz                 NOT NULL DEFAULT now(),
  updated_at                 timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_drafts_supplier_idx ON public.listing_drafts (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_drafts_status_idx   ON public.listing_drafts (status) WHERE status = 'pending_admin';

DROP TRIGGER IF EXISTS set_updated_at ON public.listing_drafts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.listing_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 6. agent_escalations (human handoff queue: support, refund intake, shopping)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.agent_escalations (
  id            uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid                     REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  agent_key     public.agent_key         NOT NULL,
  kind          text                     NOT NULL DEFAULT 'general'
                  CHECK (kind IN ('general', 'refund_intake', 'complaint', 'sales')),
  user_id       uuid                     REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_info  text,                    -- for anonymous shoppers
  order_item_id uuid                     REFERENCES public.order_items(id) ON DELETE SET NULL,
  reason        text                     NOT NULL,
  context       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  status        public.escalation_status NOT NULL DEFAULT 'open',
  assigned_to   uuid                     REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  created_at    timestamptz              NOT NULL DEFAULT now(),
  updated_at    timestamptz              NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_escalations_status_idx ON public.agent_escalations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_escalations_user_idx   ON public.agent_escalations (user_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.agent_escalations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.agent_escalations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 7. RLS
-- ===========================================================================

ALTER TABLE public.agent_prompts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_flags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_drafts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_escalations ENABLE ROW LEVEL SECURITY;

-- agent_prompts: admin only (system prompts are not user-facing)
DROP POLICY IF EXISTS "agent_prompts: admin all" ON public.agent_prompts;
CREATE POLICY "agent_prompts: admin all"
  ON public.agent_prompts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- agent_runs: user reads own; admin reads all; all writes via service role
DROP POLICY IF EXISTS "agent_runs: user read own" ON public.agent_runs;
CREATE POLICY "agent_runs: user read own"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "agent_runs: admin read" ON public.agent_runs;
CREATE POLICY "agent_runs: admin read"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (public.is_admin());

-- agent_run_steps: admin only (tool internals; may reference other users' aggregate data)
DROP POLICY IF EXISTS "agent_run_steps: admin read" ON public.agent_run_steps;
CREATE POLICY "agent_run_steps: admin read"
  ON public.agent_run_steps FOR SELECT TO authenticated
  USING (public.is_admin());

-- agent_flags: admin only; INSERT via service role only (no insert policy)
DROP POLICY IF EXISTS "agent_flags: admin select" ON public.agent_flags;
CREATE POLICY "agent_flags: admin select"
  ON public.agent_flags FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "agent_flags: admin update" ON public.agent_flags;
CREATE POLICY "agent_flags: admin update"
  ON public.agent_flags FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- listing_drafts: supplier members read own supplier's drafts; creator updates
-- while still draft; admin all. Membership check works with either the 027
-- supplier_members model (preferred) or the legacy profiles.supplier_id link.
CREATE OR REPLACE FUNCTION public.is_supplier_member_compat(p_supplier_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF to_regclass('public.supplier_members') IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.supplier_members
      WHERE supplier_id = p_supplier_id AND user_id = auth.uid() AND is_active = true
    );
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND supplier_id = p_supplier_id
  );
END;
$$;

DROP POLICY IF EXISTS "listing_drafts: member select" ON public.listing_drafts;
CREATE POLICY "listing_drafts: member select"
  ON public.listing_drafts FOR SELECT TO authenticated
  USING (public.is_supplier_member_compat(supplier_id));

DROP POLICY IF EXISTS "listing_drafts: creator update draft" ON public.listing_drafts;
CREATE POLICY "listing_drafts: creator update draft"
  ON public.listing_drafts FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'draft'::public.listing_draft_status)
  WITH CHECK (created_by = auth.uid()
              AND status IN ('draft'::public.listing_draft_status,
                             'pending_admin'::public.listing_draft_status));

DROP POLICY IF EXISTS "listing_drafts: admin all" ON public.listing_drafts;
CREATE POLICY "listing_drafts: admin all"
  ON public.listing_drafts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- agent_escalations: user reads own; admin all; INSERT via service role only
DROP POLICY IF EXISTS "escalations: user read own" ON public.agent_escalations;
CREATE POLICY "escalations: user read own"
  ON public.agent_escalations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "escalations: admin all" ON public.agent_escalations;
CREATE POLICY "escalations: admin all"
  ON public.agent_escalations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 8. fn_log_agent_run: single writer for runs + steps (SECURITY DEFINER).
--    Called from server actions; keeps token/cost accounting consistent and
--    lets the service path avoid broad table grants.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.fn_log_agent_run(
  p_run_id        uuid,               -- null on first call: creates the run
  p_agent_key     public.agent_key,
  p_prompt_id     uuid,
  p_status        public.agent_run_status,
  p_user_id       uuid DEFAULT NULL,
  p_supplier_id   uuid DEFAULT NULL,
  p_session_key   text DEFAULT NULL,
  p_trigger       text DEFAULT 'chat',
  p_input_summary text DEFAULT NULL,
  p_output_summary text DEFAULT NULL,
  p_tokens        jsonb DEFAULT '{}'::jsonb,  -- {input, output, cache_read, cost_usd, latency_ms}
  p_error         text DEFAULT NULL,
  p_steps         jsonb DEFAULT '[]'::jsonb   -- [{seq, tool_name, input_redacted, output_summary, is_error, duration_ms}]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run_id uuid := p_run_id;
  v_step   jsonb;
BEGIN
  IF v_run_id IS NULL THEN
    INSERT INTO public.agent_runs
      (agent_key, prompt_id, status, user_id, supplier_id, session_key, trigger, input_summary)
    VALUES
      (p_agent_key, p_prompt_id, p_status, p_user_id, p_supplier_id, p_session_key, p_trigger, p_input_summary)
    RETURNING id INTO v_run_id;
  ELSE
    UPDATE public.agent_runs SET
      status            = p_status,
      output_summary    = COALESCE(p_output_summary, output_summary),
      input_tokens      = COALESCE((p_tokens->>'input')::int, input_tokens),
      output_tokens     = COALESCE((p_tokens->>'output')::int, output_tokens),
      cache_read_tokens = COALESCE((p_tokens->>'cache_read')::int, cache_read_tokens),
      cost_usd          = COALESCE((p_tokens->>'cost_usd')::numeric, cost_usd),
      latency_ms        = COALESCE((p_tokens->>'latency_ms')::int, latency_ms),
      error             = COALESCE(p_error, error),
      completed_at      = CASE WHEN p_status IN ('succeeded', 'failed', 'escalated', 'rejected')
                               THEN now() ELSE completed_at END
    WHERE id = v_run_id;
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    INSERT INTO public.agent_run_steps
      (run_id, seq, tool_name, input_redacted, output_summary, is_error, duration_ms)
    VALUES (
      v_run_id,
      (v_step->>'seq')::int,
      v_step->>'tool_name',
      COALESCE(v_step->'input_redacted', '{}'::jsonb),
      v_step->>'output_summary',
      COALESCE((v_step->>'is_error')::boolean, false),
      (v_step->>'duration_ms')::int
    )
    ON CONFLICT (run_id, seq) DO NOTHING;  -- steps are append-only, replays are no-ops
  END LOOP;

  UPDATE public.agent_runs
     SET tool_steps = (SELECT count(*) FROM public.agent_run_steps WHERE run_id = v_run_id)
   WHERE id = v_run_id;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_log_agent_run(uuid, public.agent_key, uuid, public.agent_run_status, uuid, uuid, text, text, text, text, jsonb, text, jsonb) FROM anon;

-- ===========================================================================
-- 9. Audit triggers (025 fn -> audit_log) on state-bearing agent tables
-- ===========================================================================

DROP TRIGGER IF EXISTS audit_agent_prompts ON public.agent_prompts;
CREATE TRIGGER audit_agent_prompts
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_prompts
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_agent_flags ON public.agent_flags;
CREATE TRIGGER audit_agent_flags
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_flags
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_listing_drafts ON public.listing_drafts;
CREATE TRIGGER audit_listing_drafts
  AFTER INSERT OR UPDATE OR DELETE ON public.listing_drafts
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_agent_escalations ON public.agent_escalations;
CREATE TRIGGER audit_agent_escalations
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_escalations
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();
