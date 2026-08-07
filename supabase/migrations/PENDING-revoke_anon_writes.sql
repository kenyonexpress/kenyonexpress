-- PENDING: revoke_anon_writes
-- Defence in depth above RLS. NOT APPLIED. Do not run without reading the
-- "before you run this" section at the bottom.
--
-- Filename follows the convention already in this directory: the one other
-- unapplied file is PENDING-money-integer-fix.sql. There is no
-- migrations/pending/ directory in this repo.
--
--
-- WHAT IS TRUE TODAY, MEASURED AND NOT ASSUMED
--
-- `anon` holds DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and
-- UPDATE on all 46 tables in `public`. RLS is enabled on all 46 -- there is no
-- table in the schema with relrowsecurity = false -- so today RLS is the only
-- thing standing between an anonymous caller and a write.
--
-- That is one layer. A policy written slightly too wide, or a table shipped
-- before its policy, is a writable table with nothing behind it.
--
--
-- TRUNCATE IS THE ONE THAT MATTERS MOST, AND IT IS NOT AN "EXTRA LAYER"
--
-- **RLS does not apply to TRUNCATE at all.** Postgres checks the TRUNCATE
-- privilege and no policy is consulted, so for this one privilege the single
-- layer the system currently has does not exist. `anon` holding TRUNCATE on 46
-- tables is not defence-in-depth debt; it is an unguarded path to emptying any
-- table in the schema. It is revoked first below for that reason.
--
-- REFERENCES and TRIGGER are revoked in the same breath. Neither has any use
-- for an anonymous caller, and TRIGGER on a table is the ability to attach code
-- that runs as the table owner.
--
--
-- WHY THIS IS NOT THE BLANKET REVOKE IT WAS ASKED TO BE
--
-- A plain `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES ... FROM anon` breaks
-- the guest cart, which is a live, deliberate anonymous path, not an oversight:
--
--   policy "carts: owner all" on public.carts
--     USING       (profile_id = auth.uid()
--                  OR session_id = current_setting('request.cookies')::json->>'session_id'
--                  OR is_admin())
--     WITH CHECK  (profile_id = auth.uid() OR profile_id IS NULL OR is_admin())
--
-- That policy identifies a guest by a session cookie and explicitly permits
-- `profile_id IS NULL`. `src/server/actions/cart.ts` writes `carts` through
-- `createClient()`, the request-scoped anon-key client, so for a visitor who
-- has not logged in those writes execute as `anon`. Revoking the grant would
-- not tighten that path, it would delete it: no guest could add to a cart.
--
-- `carts` is the ONLY such table. Every other anonymous-facing write was
-- checked and goes through `createAdminClient()` (service_role), which these
-- statements do not touch:
--   - newsletter subscribe/confirm/unsubscribe -> newsletter_subscribers,
--     email_suppressions
--   - the analytics beacon at /api/a
-- Everything else that writes through the anon-key client (account, admin,
-- checkout) is behind an authentication gate, so it runs as `authenticated`.

begin;

-- 1. Privileges no anonymous caller has any use for, and which RLS does not
--    mediate. TRUNCATE is the important one: see the header.
revoke truncate, references, trigger on all tables in schema public from anon;

-- 2. Writes. Applied to everything, then returned to the one table that has a
--    policy written for a guest. Doing it in this order means a table added
--    since this file was written is covered rather than missed.
revoke insert, update, delete on all tables in schema public from anon;

grant insert, update, delete on public.carts to anon;

-- 3. SELECT is deliberately untouched. The public catalogue is anonymous by
--    design and RLS is the right control for it; migrations 103, 104 and 105
--    are what tightened the read side, and this file does not revisit them.

-- 4. New tables must not hand these back. Supabase's stock grant is
--    `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated,
--    service_role`, so without this the next `create table` reopens everything
--    revoked above and nothing reports it.
--
--    Default privileges are per creating role, which is why both are named: a
--    table created by the dashboard/CLI and a table created by a migration do
--    not necessarily have the same owner. Naming a role that does not exist
--    raises an error rather than being skipped, so each is guarded.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    execute 'alter default privileges for role postgres in schema public
             revoke insert, update, delete, truncate, references, trigger
             on tables from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    execute 'alter default privileges for role supabase_admin in schema public
             revoke insert, update, delete, truncate, references, trigger
             on tables from anon';
  end if;
end
$$;

commit;


-- ---------------------------------------------------------------------------
-- BEFORE YOU RUN THIS
--
-- 1. Guest cart is the whole risk surface. After applying, in a fresh private
--    window with no login: add a product to the cart, change the quantity,
--    remove it. If any of those fail, `grant` on line 3 of section 2 did not
--    take, and the fix is that grant and not a rollback of the file.
--
-- 2. Re-run the read that produced the numbers in this header:
--
--      select privilege_type, count(*)
--      from information_schema.role_table_grants
--      where grantee = 'anon' and table_schema = 'public'
--      group by privilege_type order by privilege_type;
--
--    Expected after: SELECT on 46 tables, and INSERT/UPDATE/DELETE on exactly
--    1 (carts). No TRUNCATE, REFERENCES or TRIGGER row at all.
--
-- 3. This file does not change a single policy and does not touch
--    `authenticated` or `service_role`. If something breaks that is not the
--    guest cart, this file is unlikely to be the cause.
--
-- ROLLBACK, if it is ever needed. Restores the stock Supabase posture, which
-- is the state described at the top of this file and is wider than it should
-- be:
--
--   grant insert, update, delete, truncate, references, trigger
--     on all tables in schema public to anon;
--   alter default privileges for role postgres in schema public
--     grant all on tables to anon;
-- ---------------------------------------------------------------------------
