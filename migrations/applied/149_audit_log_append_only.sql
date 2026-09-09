-- 149: audit_log becomes append-only in fact, not just in intent.
--
-- THE GAP, measured 2026-09-02: production has NO triggers on audit_log, and
-- RLS restrains only the client roles. The service-role key -- which every
-- server action holds -- can UPDATE or DELETE any audit row. An audit trail
-- that the audited code can edit is a log, not an audit trail.
--
-- (The APPLY-ORDER row for 137 mentioned "audit-log immutability triggers";
-- the 137 file contains none. The row was wrong, this file is the reality.)
--
-- INCLUDING service_role, WHICH IS THE POINT. RLS does not bind service_role,
-- so a policy cannot protect the table from the application itself. A trigger
-- fires for every role. The one legitimate "edit" an audit row ever needs is
-- redaction under a legal order, and that is a human, deliberate act: the
-- procedure is to DROP the trigger, redact, and re-CREATE it, leaving that
-- sequence itself in the database logs.
--
-- BEFORE UPDATE OR DELETE, not INSTEAD OF, not a rule: it must also bind
-- future writers that have not been written yet.
--
-- ROLLBACK
--
--   drop trigger if exists tg_audit_log_append_only on public.audit_log;
--   drop function if exists public.fn_audit_log_append_only();
--
-- DRY RUN, 2026-09-02, against production in a transaction that was rolled
-- back: UPDATE refused 42501, DELETE refused 42501, INSERT unaffected (OK).
-- Verified afterwards that no trigger of this name exists in production.
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.

CREATE OR REPLACE FUNCTION public.fn_audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % refused', TG_OP
    USING ERRCODE = '42501',
          HINT = 'Redaction under a legal order is a human act: drop the trigger, redact, re-create it.';
END
$$;

DROP TRIGGER IF EXISTS tg_audit_log_append_only ON public.audit_log;
CREATE TRIGGER tg_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_append_only();
