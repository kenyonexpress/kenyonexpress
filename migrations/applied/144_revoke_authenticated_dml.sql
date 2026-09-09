-- ============================================================================
-- PENDING 126: revoke the stock DML grant from `authenticated`
--              the sibling 111 did not have
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- Authoritative document: docs/AUTH-MODEL.md section 4.
--
-- ----------------------------------------------------------------------------
-- MEASURED AGAINST PRODUCTION 2026-08-19, THROUGH MCP, BEFORE A LINE WAS WRITTEN
-- ----------------------------------------------------------------------------
--
--   tables in public                             53
--   with RLS enabled                             53   <- every one
--   with RLS enabled and ZERO policies            8
--
--   relations granted to `authenticated`         55
--   of those with INSERT/UPDATE/DELETE granted   55   <- ALL of them
--
-- The 8 deny-all tables are:
--   legacy_percent_archive_112   payment_webhook_events   rate_limits
--   referral_signals             search_index_dlq         settlement_events
--   stock_reservations           user_rate_limits
--
-- ----------------------------------------------------------------------------
-- NOTHING IS EXPOSED TODAY. THE HAZARD IS LATENT, AND IT IS SPECIFIC.
-- ----------------------------------------------------------------------------
--
-- RLS denies these writes right now, and for the 8 tables above it denies them
-- absolutely, because RLS with zero policies denies every client role
-- unconditionally. This file changes no policy and opens nothing.
--
-- What it removes is a trapdoor:
--
--   The moment anybody adds ONE permissive policy for `authenticated` to one of
--   these tables -- to grant a read -- that role also gains INSERT, UPDATE and
--   DELETE, because the table grant was there all along.
--
-- On `settlement_events` that is the money journal. On payment_webhook_events
-- it is the callback journal the dead-letter replay depends on. On
-- stock_reservations it is the hold that stands between a sold-out product and
-- a double sale.
--
-- 111_revoke_anon_writes built exactly this second layer for `anon`, and its
-- own header calls it "defence in depth above RLS". It did not do the same for
-- `authenticated`. This is that file's missing half.
--
-- ----------------------------------------------------------------------------
-- WHY A LIST AND NOT A LOOP OVER EVERY TABLE
-- ----------------------------------------------------------------------------
--
-- `authenticated` legitimately writes to plenty of tables: carts, cart_items,
-- user_addresses, profiles, user_recent_searches, push_tokens. A blanket
-- REVOKE across the schema would break the storefront, and the RLS policies
-- that make those writes safe would keep passing while the grant beneath them
-- was gone -- a failure that looks like a policy bug and is not one.
--
-- So this file names the service-key-only tables explicitly. The list is
-- exactly the 8 measured above: the tables whose intended client access is
-- NONE, which is why they carry no policy.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The revokes
-- ---------------------------------------------------------------------------
-- SELECT is left alone deliberately. RLS already denies it with no policy, and
-- revoking it too would change the error a future reader gets from an empty
-- result to a permission failure, which is a worse diagnostic for a table
-- somebody is about to write a policy for.

REVOKE INSERT, UPDATE, DELETE ON public.legacy_percent_archive_112 FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_webhook_events     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limits                FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.referral_signals           FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.search_index_dlq           FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.settlement_events          FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stock_reservations         FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_rate_limits           FROM authenticated;

-- Same for `anon`, which 111 covered schema-wide but which is restated here so
-- this file is complete on its own if 111 is ever partially rolled back.
REVOKE INSERT, UPDATE, DELETE ON public.legacy_percent_archive_112 FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_webhook_events     FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rate_limits                FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.referral_signals           FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.search_index_dlq           FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.settlement_events          FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.stock_reservations         FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_rate_limits           FROM anon;

-- ---------------------------------------------------------------------------
-- 2. What this file does NOT do
-- ---------------------------------------------------------------------------
--
--  * No policy is created, dropped or altered. Access is exactly what it was.
--  * No table outside the 8 is touched. The storefront's writes are untouched.
--  * No default privileges are altered. 111 already tried; the supabase_admin
--    branch needs privileges the MCP connection does not have (42501), and
--    that gap is recorded in docs/AUTH-MODEL.md section 7 item 4 rather than
--    silently retried here.
--  * SELECT is not revoked. See the note above section 1.
--
-- ============================================================================
-- VERIFICATION (after applying)
-- ============================================================================
--
-- 1. The grants are gone (expect 0 rows):
--
--      select g.table_name, g.grantee, g.privilege_type
--        from information_schema.role_table_grants g
--       where g.table_schema = 'public'
--         and g.grantee in ('anon','authenticated')
--         and g.privilege_type in ('INSERT','UPDATE','DELETE')
--         and g.table_name in (
--           'legacy_percent_archive_112','payment_webhook_events','rate_limits',
--           'referral_signals','search_index_dlq','settlement_events',
--           'stock_reservations','user_rate_limits');
--
-- 2. The storefront's own writes still work. THIS IS THE ONE THAT MATTERS,
--    because the failure mode of over-revoking is a cart that silently stops
--    saving. Expect all three to succeed inside a rolled-back block, as the
--    guest-cart check in 111 did:
--
--      set local role authenticated;
--      DO $$ BEGIN
--        INSERT INTO public.carts (user_id) VALUES ((SELECT auth.uid()));
--        RAISE EXCEPTION 'rollback: the storefront write path is intact';
--      END $$;
--
-- 3. Nothing else lost a grant (compare before/after):
--
--      select count(*) from information_schema.role_table_grants
--       where table_schema='public' and grantee='authenticated'
--         and privilege_type in ('INSERT','UPDATE','DELETE');
--      -- expected: 55 before, 47 after
--
-- ROLLBACK
--
--   GRANT INSERT, UPDATE, DELETE ON public.legacy_percent_archive_112 TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.payment_webhook_events     TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.rate_limits                TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.referral_signals           TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.search_index_dlq           TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.settlement_events          TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.stock_reservations         TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.user_rate_limits           TO authenticated;
--   -- and the same eight for `anon`, though 111 revokes those schema-wide.
-- ============================================================================
