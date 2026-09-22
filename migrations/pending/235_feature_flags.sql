-- 235_feature_flags.sql
--
-- Section 83: the "phase 2" storage docs/ARCHITECTURE-FEATURE-FLAGS.md §2
-- described and nothing implemented: one row per flag, service role only,
-- toggled from /admin/feature-flags with an audit row, read by the server
-- with a 30-second cache and with the environment taking precedence
-- (src/lib/resilience/feature-flags.ts says why in that order).
--
-- Kill switches (KILL_SWITCH_*) and MAINTENANCE_MODE are NOT here. They are
-- read at call time from the environment on purpose: a switch that has to
-- reach the database to say "stop reaching the database" is not a switch,
-- and the proxy that serves the maintenance page runs where a database read
-- is the wrong cost. Both stay env-only; the admin page shows them read-only.
--
-- RLS on with no policies = service role only, like every operator table
-- here. IDEMPOTENT: IF NOT EXISTS + ON CONFLICT DO NOTHING; a second run
-- changes no value an admin has set.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL,
  description text NOT NULL DEFAULT '',
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feature_flags IS
  'Operator-toggled feature flags. Environment values override rows; kill switches and MAINTENANCE_MODE are env-only. See 235 and docs/RESILIENCE.md.';

ALTER TABLE public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_key_shape;
ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_key_shape
  CHECK (key ~ '^[A-Z][A-Z0-9_]{2,63}$' AND length(description) <= 300);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_flags FROM PUBLIC, anon, authenticated;

-- The documented flags with their documented production defaults
-- (ARCHITECTURE-FEATURE-FLAGS.md §1). ESCROW_FLOW_ENABLED is deliberately
-- absent: the doc says it must never be true, and a row is an invitation.
INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('CHECKOUT_ENABLED', true, 'כבוי = beginCheckout מחזיר CHECKOUT_DISABLED. הסביבה גוברת.'),
  ('NOTIFICATIONS_ENABLED', true, 'כבוי = האירועים נרשמים, השליחה מדלגת.'),
  ('WHATSAPP_NOTIFICATIONS_ENABLED', false, 'דלוק רק אחרי אישור התבניות.'),
  ('SEARCH_ENABLED', true, 'כבוי = החיפוש מחזיר רשימה ריקה.'),
  ('WALLET_APPLY_ENABLED', true, 'כבוי = אי אפשר לשלם מהארנק בקופה.'),
  ('SUPPLIER_SCAN_ENABLED', true, 'כבוי = סורק הספק מסרב לממש.'),
  ('AI_CS_AGENT_ENABLED', false, 'דלוק רק אחרי ריצת צל.'),
  ('AI_SUPPLIER_AGENT_ENABLED', false, ''),
  ('DEALS_AUTOPILOT', false, 'כבוי = מסלול ה-cron של תור הדילים מדלג בלי לגעת בשום ספק. סעיף 96, docs/DEALS-PIPELINE.md.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
