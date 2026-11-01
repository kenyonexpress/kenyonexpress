-- 212: RBAC hardening leftovers, measured against production via MCP on
-- 2026-09-09 (full-table RLS audit under docs/RLS-AUDIT-2026-09-09.md).
--
-- WHY. The audit found the role model itself already deployed (181 is live:
-- read_only viewer tier, role-change ladder, super_admin MFA policy) and all
-- 93 public tables under RLS. Two measured gaps remain, both invisible to
-- RLS policy review because neither is governed by policies:
--
--   (1) `authenticated` holds TRUNCATE on 72 public tables (the Supabase
--       bootstrap GRANT ALL). RLS does not apply to TRUNCATE: policies gate
--       SELECT/INSERT/UPDATE/DELETE only. PostgREST exposes no TRUNCATE
--       verb today, so this is defence in depth, not an open hole; but any
--       future SECURITY DEFINER function, pooled connection or API change
--       that lets an authenticated session issue TRUNCATE empties orders,
--       payments or audit_log in one statement, silently, past every policy.
--       No client code path truncates anything (grep: zero occurrences).
--       `anon` write grants are already down to carts DML only, which is the
--       guest-cart path and stays.
--   (2) Three functions run with a role-mutable search_path (advisor
--       0011): set_updated_at, fn_cashback_ledger_block_mutation,
--       fn_il_phone_digits. All three are trigger/helper functions invoked
--       from table triggers, so a session-controlled search_path could
--       shadow the objects they reference. Pinning to `public` matches
--       every other function in the schema (advisor count after: 0).
--
-- Deliberately NOT touched, with reasons recorded in the audit doc:
--   - media_ingest_queue zero-policy state: 210 documents it as intentional
--     (service-role only writer, client grants revoked in the same file).
--   - is_admin() anon EXECUTE: anon-facing policies on suppliers,
--     seo_redirects, categories et al. call it in their USING clause; anon
--     sessions need EXECUTE for those policies to evaluate. It leaks
--     nothing (returns false for anon).
--   - Blanket authenticated DML revoke: that is pending 144's scoped job;
--     RLS gates every DML verb in the meantime.
--
-- ROLLBACK. GRANT TRUNCATE back to authenticated per table if a legitimate
-- truncating client ever appears (none exists); ALTER FUNCTION ... RESET
-- search_path for the three functions.

-- ---------------------------------------------------------------------------
-- 1. TRUNCATE: revoke from client roles, existing tables and future defaults.
--    REVOKE is naturally idempotent.
-- ---------------------------------------------------------------------------

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pin search_path on the three advisor-flagged functions. ALTER ... SET is
--    idempotent. pg_catalog stays implicitly first, so behaviour is unchanged
--    for the bodies these functions run today.
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.fn_cashback_ledger_block_mutation() SET search_path = public;
ALTER FUNCTION public.fn_il_phone_digits(p_raw text) SET search_path = public;
