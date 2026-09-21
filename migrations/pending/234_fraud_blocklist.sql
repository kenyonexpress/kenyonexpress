-- 234_fraud_blocklist.sql
--
-- Section 57: a blocklist an operator writes to, with a reason and an expiry,
-- that the checkout refuses on. The one fraud table where the answer is "no"
-- rather than a score: docs/FRAUD.md section 0 keeps refusals countable and
-- readable to the customer who was stopped, and a blocklist row IS that kind
-- of rule -- somebody typed the value and the reason, and both can be read
-- back.
--
-- No client role touches it. Admins read and write through the service role
-- from /admin/fraud (requireSection + audit_log on every change); the checkout
-- reads it with the service role. RLS is enabled with no policies, which on
-- this project means "service role only" and nothing else (46/46 tables, see
-- NEXT-GOALS goal 9).
--
-- Values are stored NORMALISED by src/lib/fraud/blocklist.ts (lower-cased
-- email, digits-only phone, trimmed IP, the card token id as given) so the
-- partial unique index below means "one active row per thing", not per
-- spelling.
--
-- IDEMPOTENT: IF NOT EXISTS / DROP IF EXISTS throughout. Independent of every
-- other pending file, 202 included.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fraud_blocklist (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,
  value        text NOT NULL,
  reason       text NOT NULL,
  expires_at   timestamptz,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  removed_at   timestamptz,
  removed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  removal_note text
);

COMMENT ON TABLE public.fraud_blocklist IS
  'Operator-written refusals at checkout: an email, phone, IP or card fingerprint with a reason and an optional expiry. See 234 and docs/FRAUD-RULES.md.';

ALTER TABLE public.fraud_blocklist DROP CONSTRAINT IF EXISTS fraud_blocklist_kind_allowed;
ALTER TABLE public.fraud_blocklist ADD CONSTRAINT fraud_blocklist_kind_allowed
  CHECK (kind IN ('email', 'phone', 'ip', 'card_fingerprint'));

ALTER TABLE public.fraud_blocklist DROP CONSTRAINT IF EXISTS fraud_blocklist_shape;
ALTER TABLE public.fraud_blocklist ADD CONSTRAINT fraud_blocklist_shape
  CHECK (
    length(value) BETWEEN 1 AND 320
    AND length(reason) BETWEEN 3 AND 500
    AND (removal_note IS NULL OR length(removal_note) <= 500)
    AND (expires_at IS NULL OR expires_at > created_at)
  );

ALTER TABLE public.fraud_blocklist DROP CONSTRAINT IF EXISTS fraud_blocklist_removal_complete;
ALTER TABLE public.fraud_blocklist ADD CONSTRAINT fraud_blocklist_removal_complete
  CHECK ((removed_at IS NULL AND removed_by IS NULL) OR removed_at IS NOT NULL);

-- One active row per (kind, value): the second operator to block the same
-- address gets a 23505 that the action reads as "already blocked".
CREATE UNIQUE INDEX IF NOT EXISTS fraud_blocklist_active_idx
  ON public.fraud_blocklist (kind, value)
  WHERE removed_at IS NULL;

-- The checkout's read: active rows for a handful of values.
CREATE INDEX IF NOT EXISTS fraud_blocklist_lookup_idx
  ON public.fraud_blocklist (kind, value, expires_at)
  WHERE removed_at IS NULL;

ALTER TABLE public.fraud_blocklist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fraud_blocklist FROM PUBLIC, anon, authenticated;

COMMIT;
