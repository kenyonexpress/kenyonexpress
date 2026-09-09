-- 157: IP retention on an append-only audit trail. Runs AFTER 149.
--
-- 149 makes audit_log append-only with a BEFORE UPDATE OR DELETE trigger that
-- refuses everything. Right for integrity, but it also freezes ip_address
-- forever, and an IP is personal data with no audit value after a year --
-- WHO did WHAT stays, WHERE FROM ages out.
--
-- The exception is carved into the trigger itself, as narrowly as it can be
-- written: an UPDATE passes only when (a) the ONLY change is ip_address
-- (checked by comparing the rows with ip_address stripped from both), (b) the
-- new value is NULL -- redaction, never rewriting, and (c) the row is older
-- than 365 days. DELETE stays refused unconditionally. Everything else about
-- 149's stance -- including "redaction under a legal order is a human act" --
-- is unchanged; this is aging, not redaction.
--
-- fn_audit_retention_sweep() is the ONLY intended caller: SECURITY DEFINER,
-- EXECUTE revoked from anon/authenticated (the definer-uid trap stays closed;
-- only the server can run it), returns the number of rows aged. The cron
-- route /api/cron/retention calls it monthly and tolerates PGRST202 until
-- this file is applied.
--
-- ROLLBACK
--
--   -- restore 149's unconditional function body:
--   --   RAISE EXCEPTION ... (see 149) for every UPDATE/DELETE
--   drop function if exists public.fn_audit_retention_sweep();
--
-- DRY RUN, 2026-09-02, against production in a transaction rolled back by a
-- RAISE at the end (149's trigger created first inside the txn, then this):
-- ordinary UPDATE refused 42501; DELETE refused 42501; sweep aged the one
-- eligible seeded row (count=1) and left a young row's ip intact; a second
-- sweep aged 0. ok=t problems=[none].
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.

CREATE OR REPLACE FUNCTION public.fn_audit_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  -- The one sanctioned mutation: aging out an IP after a year. Strip
  -- ip_address from both images; any other difference refuses as before.
  IF TG_OP = 'UPDATE'
     AND NEW.ip_address IS NULL
     AND OLD.created_at < now() - interval '365 days'
     AND to_jsonb(NEW) - 'ip_address' = to_jsonb(OLD) - 'ip_address' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_log is append-only: % refused', TG_OP
    USING ERRCODE = '42501',
          HINT = 'Redaction under a legal order is a human act: drop the trigger, redact, re-create it.';
END
$$;

CREATE OR REPLACE FUNCTION public.fn_audit_retention_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.audit_log
     SET ip_address = NULL
   WHERE ip_address IS NOT NULL
     AND created_at < now() - interval '365 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION public.fn_audit_retention_sweep() FROM PUBLIC, anon, authenticated;
