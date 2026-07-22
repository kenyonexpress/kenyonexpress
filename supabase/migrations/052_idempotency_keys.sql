-- ============================================================================
-- 052_idempotency_keys.sql  (spec number 035; renumbered 033->050 ... 039->056
-- because 033-035 already exist in this tree and 049 was the last used
-- number; see LEDGER-DESIGN.md section 0)
--
-- Generic server-side idempotency key store. Complements (does not replace)
-- the dedicated keys that already exist: payments.idempotency_key UNIQUE,
-- ledger_journals.event_key UNIQUE, payment_webhook_events
-- (provider, external_event_id) UNIQUE, wallet_entries.idempotency_key UNIQUE.
-- Usage pattern (service role only):
--   INSERT INTO idempotency_keys (scope, key, response_hash, expires_at)
--   VALUES ($1, $2, $3, now() + interval '24 hours')
--   ON CONFLICT (scope, key) DO NOTHING RETURNING id;
--   -- no row returned => replay: load the stored response_hash and compare /
--   -- return the cached outcome instead of re-executing the money operation.
--
-- CLEANUP GUIDANCE: rows are garbage after expires_at. Schedule (pg_cron or a
-- Supabase scheduled Edge Function, daily, off-peak):
--   DELETE FROM public.idempotency_keys WHERE expires_at < now() - interval '7 days';
-- The 7 day grace keeps forensic replay evidence past the functional window.
-- Never delete from request-handling code paths.
--
-- ROLLBACK NOTE: standalone table, no other object references it (056 only
-- enables RLS on it). To roll back:
--   DROP TABLE IF EXISTS public.idempotency_keys;
-- ============================================================================

-- Defensive: 001 may stop early on live DBs.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Namespace of the operation, e.g. 'checkout:begin', 'wallet:cashback',
  -- 'refund:execute'. Keys are only unique within a scope.
  scope         text NOT NULL CHECK (length(scope) BETWEEN 1 AND 120),
  key           text NOT NULL CHECK (length(key) BETWEEN 1 AND 300),
  -- Hash (e.g. sha256 hex) of the canonical serialized response of the first
  -- successful execution; lets a replay detect divergent payloads.
  response_hash text,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_scope_key_key
  ON public.idempotency_keys (scope, key);

-- Serves the scheduled cleanup delete.
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
  ON public.idempotency_keys (expires_at);

DROP TRIGGER IF EXISTS set_updated_at ON public.idempotency_keys;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Server-only table: RLS enabled, no policies for any client role (default
-- deny; service_role bypasses RLS). Confirmed again in 056.
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
