-- 188: pin search_path on the three functions that do not have it.
--
-- NOT APPLIED. Written to pending on 2026-09-09 and waiting for approval like
-- every other file here.
--
-- WHY THIS IS NOT THE ESCALATION THE ADVISOR NAME SUGGESTS. Supabase's
-- `function_search_path_mutable` lint reported exactly three functions on
-- 2026-09-09:
--
--     set_updated_at                     SECURITY INVOKER   trigger
--     fn_cashback_ledger_block_mutation  SECURITY INVOKER   trigger
--     fn_il_phone_digits                 SECURITY INVOKER   scalar
--
-- All three are SECURITY INVOKER, measured from `pg_proc.prosecdef`. A mutable
-- search_path is a privilege-escalation vector on a SECURITY DEFINER function,
-- because the attacker controls name resolution inside a body that runs as the
-- owner. An INVOKER function runs as the caller and resolves names with the
-- caller's own search_path, so shadowing a name buys the caller nothing they
-- did not already have.
--
-- The 61 SECURITY DEFINER functions in production all pin search_path, and
-- zero are unpinned. That is the property that matters and it still holds.
--
-- The bodies were read rather than assumed, and none of them resolves a name
-- an attacker could shadow anyway:
--
--   set_updated_at                     NEW.updated_at := now()
--   fn_cashback_ledger_block_mutation  an unconditional RAISE EXCEPTION
--   fn_il_phone_digits                 regexp_replace / substr / left / length
--
-- `now()` and the string functions live in pg_catalog, which Postgres searches
-- implicitly and first unless it is named explicitly later in search_path, so
-- a `public.now()` planted by a caller does not win. fn_il_phone_digits is
-- granted to service_role only.
--
-- SO WHY APPLY IT AT ALL. Because "three unpinned functions, all harmless"
-- costs a paragraph like this one every time somebody reads the advisor, and
-- the next unpinned function to appear will be read as the fourth harmless one
-- rather than looked at. Zero is a number a gate can hold; three-with-a-reason
-- is not.
--
-- Bodies are reproduced verbatim from production, so CREATE OR REPLACE changes
-- the search_path setting and nothing else.
--
-- VERIFIED AGAINST PRODUCTION, WITHOUT APPLYING IT. All three statements were
-- run inside one DO block that ended in an unconditional RAISE, so the whole
-- statement rolled back. It parsed, and the pinned `fn_il_phone_digits` was
-- called three times under `search_path = ''` before the rollback:
--
--     '054-123-4567'      -> 972541234567
--     '+972 54 123 4567'  -> 972541234567
--     '12'                -> NULL
--
-- which is what it returns unpinned. That is the check worth running, because
-- `search_path = ''` is exactly the setting that breaks a body relying on an
-- unqualified name: pg_catalog stays implicitly first, `public` does not.
-- `pg_proc.proconfig` was re-read afterwards and is still `(none)` for all
-- three, so nothing was left behind.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cashback_ledger_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'cashback_ledger is append-only; write a compensating admin_adjustment instead';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_il_phone_digits(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_digits text;
  v_rest   text;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_raw, '\D', '', 'g');
  IF v_digits = '' THEN RETURN NULL; END IF;

  IF left(v_digits, 3) = '972' THEN
    v_rest := regexp_replace(substr(v_digits, 4), '^0', '');
    IF length(v_rest) BETWEEN 8 AND 9 THEN RETURN '972' || v_rest; END IF;
    RETURN NULL;
  END IF;

  IF left(v_digits, 1) = '0' AND length(v_digits) BETWEEN 9 AND 10 THEN
    RETURN '972' || substr(v_digits, 2);
  END IF;

  RETURN NULL;
END;
$$;
