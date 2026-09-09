-- 224_grant_recent_search_execute.sql
--
-- One GRANT. Without it the recent-search list can never have anything in it.
--
-- =============================================================================
-- WHAT WAS MEASURED, 2026-09-10
-- =============================================================================
--
-- `fn_record_recent_search(text)` is SECURITY DEFINER and its body is correct:
-- it reads `auth.uid()`, returns immediately when there is no session, clamps
-- the term, upserts one row per (user, term) and trims the user's history to
-- ten. It is granted EXECUTE to `postgres` and `service_role` ONLY --
-- information_schema.routine_privileges, read against production.
--
-- The application calls it through the SHOPPER'S client, which is `anon` for a
-- visitor and `authenticated` for a customer. Neither has the grant, so
-- PostgREST refuses before the body runs:
--
--   anon           -> "RLS denied: POST rpc:fn_record_recent_search", 39 events
--                     in eight hours in Sentry, one per anonymous search.
--                     FIXED IN CODE, not here: `recordRecentSearch` now checks
--                     for a session first and does not call at all without one.
--   authenticated  -> the same refusal, silently swallowed. This is the half
--                     that needs a grant, and the evidence is the row count:
--                     `user_recent_searches` held ZERO rows on the same day.
--
-- So the feature has never worked for anybody. `/api/search/quick-links` reads
-- the table through the shopper's own session and renders their five most
-- recent searches; that list has been empty for every customer since the table
-- was created, and nothing failed loudly enough for anyone to look.
--
-- =============================================================================
-- WHY ONLY `authenticated`
-- =============================================================================
--
-- `anon` is deliberately NOT granted. The function writes a row keyed on
-- `auth.uid()`, which is null for `anon`, so the only thing the grant would buy
-- is the ability for an unauthenticated caller to invoke a SECURITY DEFINER
-- function that touches a per-user table. It would do nothing today, and it
-- would be one edit away from doing something -- the project has already been
-- bitten by a definer function taking a caller-controlled uid
-- (127_revoke_check_rate_limit_execute is the same lesson at a different site).
--
-- The code branch added beside this migration is what makes the absent `anon`
-- grant silent instead of noisy, so the two changes are not alternatives: the
-- branch stops the errors, this makes the feature work.
--
-- =============================================================================
-- REVERSAL
-- =============================================================================
--
--   REVOKE EXECUTE ON FUNCTION public.fn_record_recent_search(text) FROM authenticated;
--
-- Reversing it returns the feature to silently empty, not to broken: the code
-- branch stands on its own and the swallowed warning is already handled.

BEGIN;

GRANT EXECUTE ON FUNCTION public.fn_record_recent_search(text) TO authenticated;

-- Proves the grant landed rather than assuming it. `has_function_privilege`
-- answers for the role as it will be used, which is what the application's
-- JWT resolves to.
DO $$
BEGIN
  IF NOT has_function_privilege(
       'authenticated', 'public.fn_record_recent_search(text)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'authenticated still cannot execute fn_record_recent_search';
  END IF;

  -- And the one that must NOT have moved. A migration that widened anon by
  -- accident is exactly the failure this file's own header warns about.
  IF has_function_privilege(
       'anon', 'public.fn_record_recent_search(text)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'anon must not be able to execute fn_record_recent_search';
  END IF;
END
$$;

COMMIT;
