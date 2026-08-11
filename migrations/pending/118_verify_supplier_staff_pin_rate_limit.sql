-- 118: the PIN rate limit moves inside the function that checks the PIN.
--
-- STATUS: APPLIED to production on 2026-08-12 through MCP apply_migration
-- (migration name `verify_supplier_staff_pin_rate_limit`). Never db push.
--
-- WHY THE ROUTE'S LIMIT WAS NOT ENOUGH. src/app/api/supplier/app/pin/route.ts
-- limits to 15/hour per user and says so in its own header -- and in the same
-- header explains that `verify_supplier_staff_pin` is "deliberately callable
-- directly, so the portal can use it". It is granted to `authenticated`. Any
-- supplier session can therefore skip the route entirely and get unlimited
-- tries at a four-digit PIN over /rest/v1/rpc/. The limit has to live where the
-- check lives; anywhere else is a suggestion.
--
-- WHY FAILURES ONLY, NOT ATTEMPTS. A cashier identifies themselves at the till
-- many times in a shift. Counting successes would lock a working business out
-- inside the hour. The counter is deleted on every correct PIN and only
-- survives failures, so five wrong PINs in fifteen minutes locks and normal use
-- never approaches it.
--
-- WHY NOT check_rate_limit(). It increments on every call by construction, so
-- it cannot express "count only the failures" without counting the successes
-- first. The upsert below is the same shape as the one inside check_rate_limit,
-- against the same rate_limits table, moved to the failure branch.
--
-- THE DEAD LOCKOUT THIS REPLACES. supplier_staff.failed_attempts and
-- .locked_until are reset to 0/NULL on success and incremented NOWHERE. They
-- have been dead since they were added, and they cannot work as designed: a
-- wrong PIN matches no row, so there is no staff member to attribute the
-- failure to. The identity that IS known on a failure is the caller. That is
-- what this counts. The existing locked_until read is kept, so a row locked by
-- hand still reports locked=true.
--
-- MEASURED ON PRODUCTION, in a DO block rolled back by a closing RAISE, with a
-- synthetic supplier_member + supplier_staff (production has no supplier with
-- active staff yet):
--
--   wrong 1..5            rows=false            silent, unchanged behaviour
--   wrong 6               locked=true           lockout engages
--   wrong 7               locked=true           holds
--   correct, while locked locked=true           a correct PIN does not bypass
--   correct, after window locked=false, name ok
--   counter cleared on success = true

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

  v_key := 'supplier_pin:' || v_uid::text;

  SELECT r.attempts INTO v_attempts
    FROM public.rate_limits r
   WHERE r.key = v_key
     AND r.window_start > now() - c_window;

  -- Locked out: report it the way a locked staff row reports it, so the route
  -- keeps answering 423 and the client needs no new branch.
  IF coalesce(v_attempts, 0) >= c_max THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, true;
    RETURN;
  END IF;

  -- A malformed PIN is still an attempt. The route rejects it before calling,
  -- so only a direct RPC caller arrives here with one, and that is exactly the
  -- caller this limit exists for.
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

  DELETE FROM public.rate_limits WHERE key = v_key;

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
