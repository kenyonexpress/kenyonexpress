-- 177_set_updated_at_search_path.sql
--
-- NOT APPLIED. Run preflight_177.sql first.
--
-- Supabase advisor `function_search_path_mutable`, read 2026-09-08:
-- `public.set_updated_at` has no `search_path` set. It is used by 52 triggers.
--
-- SEVERITY, STATED HONESTLY BECAUSE IT IS LOWER THAN THE LINT NAME SUGGESTS.
-- The dangerous form of this is a SECURITY DEFINER function with a mutable
-- search_path: it runs as its owner, so an attacker who can create an object
-- in an earlier schema on the path gets that owner's privileges. This function
-- is `prosecdef = false`, measured, so it runs as the CALLER and resolving a
-- name to an attacker's object would give the attacker only what they already
-- had. It is defence in depth, not an open door.
--
-- It is still worth fixing, for two reasons that are not severity. Fifty-two
-- triggers is the widest blast radius of any single function in this schema,
-- so it is the one place where an unqualified name resolution is most likely
-- to surprise somebody later. And the advisor will keep reporting it on every
-- pass, which trains the reader to skim a list that should be empty.
--
-- `SET search_path = pg_catalog` rather than `''`, AND THE REASON FIRST GIVEN
-- HERE WAS WRONG. It said an empty path "would make the function raise
-- `function now() does not exist` on the next write to any of those 52 tables".
-- That is not how Postgres resolves names: pg_catalog is searched implicitly
-- and always, whatever search_path says, so `''` cannot hide `now()`.
--
-- Measured 2026-09-09 against this database, in a DO block that raised at the
-- end so nothing committed. Two pg_temp functions with the same body as this
-- one, one at `SET search_path TO ''` and one at `SET search_path TO
-- 'pg_catalog'`:
--
--   search_path = ''          -> 2026-09-08 19:03:18.836716+00
--   search_path = 'pg_catalog' -> 2026-09-08 19:03:18.836716+00
--
-- Both return. Neither raises. Supabase's own guidance is `''`, and it would
-- have been just as safe here.
--
-- The VALUE below is unchanged, because both are correct for a body whose only
-- unqualified name is `now()`, and because preflight_177 was measured against
-- `pg_catalog`. Naming it explicitly also documents what the body depends on.
-- What changes is the justification: this is a style choice, not a rescue from
-- a breakage that was never going to happen. A future function that touches a
-- `public` table needs `''` plus full qualification, and would have been
-- steered wrong by the sentence that used to be here.
--
-- The body is unchanged, character for character. Only the config is added.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

COMMIT;

-- NOTE FOR WHOEVER APPLIES THIS. `CREATE OR REPLACE FUNCTION` does not
-- re-create the triggers; they reference the function by oid and keep working.
-- No trigger needs dropping and no table needs locking beyond the catalogue
-- row. Verified in the preflight by counting the triggers before and after.
