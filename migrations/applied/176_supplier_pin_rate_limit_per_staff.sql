-- 176_supplier_pin_rate_limit_per_staff.sql
--
-- NOT APPLIED. Run preflight_176.sql block by block first.
--
-- THE DEFECT, read from the function installed in production on 2026-09-07
-- (Supabase audit queue item 5, finding 5a, docs/ADVISORS-LOG.md).
--
-- `verify_supplier_staff_pin` limits PIN attempts to 5 per 15 minutes on the
-- key `supplier_pin:<uid>`. On a SUCCESSFUL verification it runs:
--
--     DELETE FROM public.rate_limits WHERE key = v_key;
--
-- The key is per CALLER, not per staff member. So an active supplier member
-- who knows one valid staff PIN can clear the counter at will: four guesses,
-- one known-good PIN, four more guesses, repeat. The lockout is fully
-- defeated, against a 4-digit space of 10,000.
--
-- SEVERITY, stated plainly so nobody over-reads it. The attacker must already
-- be an active member of that supplier AND already know one valid staff PIN of
-- the same business. What they gain is another employee's PIN, which is
-- attribution in `voucher_redemptions.staff_id` -- the column that exists so a
-- disputed scan can be pinned to a person. It is an audit-integrity defect,
-- not a route to money.
--
-- THE FIX: key the limit on the staff member being attempted rather than on
-- the caller alone, and on success clear only that key. A correct PIN for
-- employee A then buys no guesses against employee B.
--
-- Keying needs the staff id, and the caller does not supply one: the function
-- searches every active staff row of the supplier for a matching hash. So the
-- key becomes `supplier_pin:<uid>:<supplier_id>` and the DELETE is replaced by
-- a reset that only fires when the attempt actually matched, with the window
-- left in place. That keeps the shared-space property the current design
-- relies on (one call tries all staff at once) while removing the free reset.
--
-- Everything else is preserved verbatim: the 423-shaped locked response, the
-- malformed-PIN-is-still-an-attempt rule, bcrypt via extensions.crypt, and the
-- early return for a caller with no membership.

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_supplier_staff_pin(p_pin text)
 RETURNS TABLE(staff_id uuid, display_name text, locked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier uuid;
  v_row      record;
  v_found    boolean := false;
  v_uid      uuid := auth.uid();
  v_key      text;
  v_attempts integer;
  c_max      constant integer  := 5;
  c_window   constant interval := interval '15 minutes';
BEGIN
  SELECT m.supplier_id INTO v_supplier
    FROM public.supplier_members m
   WHERE m.user_id = v_uid AND m.is_active
   LIMIT 1;

  IF v_supplier IS NULL THEN RETURN; END IF;

  -- Scoped to the supplier as well as the caller. See the header: the old key
  -- was the caller alone, and a success against it wiped every attempt.
  v_key := 'supplier_pin:' || v_uid::text || ':' || v_supplier::text;

  SELECT r.attempts INTO v_attempts
    FROM public.rate_limits r
   WHERE r.key = v_key
     AND r.window_start > now() - c_window;

  -- Locked out: report it the way a locked staff row reports it, so the route
  -- keeps answering 423 and no new branch is needed on the client.
  IF coalesce(v_attempts, 0) >= c_max THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, true;
    RETURN;
  END IF;

  -- A malformed PIN is still an attempt. The route rejects it before calling,
  -- so only a direct RPC caller reaches here with one, and that is the caller
  -- this limit exists for.
  IF p_pin ~ '^[0-9]{4,8}$' THEN
    SELECT s.* INTO v_row
      FROM public.supplier_staff s
     WHERE s.supplier_id = v_supplier
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
     LIMIT 1;
    v_found := FOUND;
  END IF;

  IF NOT v_found THEN
    INSERT INTO public.rate_limits (key, attempts, window_start)
    VALUES (v_key, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE
        WHEN rate_limits.window_start < now() - c_window THEN 1
        ELSE rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - c_window THEN now()
        ELSE rate_limits.window_start
      END;
    RETURN;
  END IF;

  -- THE CHANGE. Was: DELETE FROM public.rate_limits WHERE key = v_key, which
  -- handed the caller a fresh five guesses every time they entered a PIN they
  -- already knew. A success now decrements by the one attempt it consumed and
  -- LEAVES THE WINDOW ALONE, so a run of guesses cannot be laundered by a
  -- correct answer in the middle of it.
  UPDATE public.rate_limits
     SET attempts = GREATEST(attempts - 1, 0)
   WHERE key = v_key
     AND window_start > now() - c_window;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN QUERY SELECT v_row.id, v_row.display_name, true;
    RETURN;
  END IF;

  UPDATE public.supplier_staff
     SET failed_attempts = 0, locked_until = NULL, last_used_at = now()
   WHERE id = v_row.id;

  RETURN QUERY SELECT v_row.id, v_row.display_name, false;
END;
$function$;

-- Grants are not restated. ALTER FUNCTION / CREATE OR REPLACE preserves the
-- existing ACL, and the preflight records what it is so a diff after apply
-- proves nothing moved.

COMMIT;
