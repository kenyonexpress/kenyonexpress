-- 230_revoke_surplus_client_dml.sql
--
-- Takes INSERT, UPDATE and DELETE away from `authenticated` on 38 relations it
-- has never been able to use and must never be able to use.
--
-- =============================================================================
-- WHAT WAS MEASURED, 2026-09-10, AGAINST PRODUCTION
-- =============================================================================
--
-- `docs/SECURITY-POSTURE.md` §4 calls this "the one structural gap" and its
-- recommendation is one line: re-apply the DML revoke on the money tables. It
-- was measured at 56 relations. It is not 56 any more:
--
--   grantee        privilege   tables
--   authenticated  INSERT      74
--   authenticated  UPDATE      72
--   authenticated  DELETE      72
--   anon           INSERT      1     (carts, and that one is deliberate)
--   anon           UPDATE      1
--   anon           DELETE      1
--
-- It grows on its own. Supabase's default privileges grant the client roles
-- everything on every new table, so each migration that creates a table hands
-- `authenticated` three more write privileges unless it says otherwise, and
-- nothing was measuring the total.
--
-- =============================================================================
-- WHY THIS IS PROVABLY INERT, WHICH IS THE WHOLE POINT
-- =============================================================================
--
-- The 38 relations below are exactly those where the client roles hold a DML
-- privilege AND no PERMISSIVE policy grants any client role INSERT, UPDATE,
-- DELETE or ALL. With RLS on and no permissive write policy, Postgres denies
-- every write by that role before a grant is ever consulted. So every write to
-- these relations through PostgREST fails TODAY, and revoking cannot break a
-- code path that works: any such path is already failing.
--
-- The five `v_` views were checked separately, because a view carries no RLS of
-- its own and an auto-updatable view would push the write down to its base
-- table. Every use of all five in the repository is `.select()` -- read on
-- 2026-09-10, `grep "from('v_"` over src/ and apps/ -- so there is no write path
-- to lose there either.
--
-- WHAT IT BUYS, then, is the layer underneath the policy. Today one wrong
-- permissive policy on `payments`, `vouchers`, `refunds` or any wallet table is
-- a live vulnerability, because the grant is already there waiting for it.
-- After this, the same mistake is inert until somebody also writes a GRANT.
-- §4 says this in the sentence worth keeping: "a policy that is merely
-- permissive by accident is a live vulnerability here, where in a
-- defence-in-depth setup it would be a hardening item".
--
-- =============================================================================
-- WHAT THIS DELIBERATELY DOES NOT DO
-- =============================================================================
--
-- 1. **It does not change the default privileges.** That would be the fix for
--    the growth rather than the stock, and it would silently break the next
--    migration that creates a table a client legitimately writes to: the author
--    would get a denial with no hint that the default moved. The gate is the
--    answer instead -- `client_dml_grants` in `supabase/rls-manifest.json`
--    records the measured list, and `src/lib/auth/rls-manifest.test.ts` fails
--    when this file and that ledger stop agreeing.
--
-- 2. **It does not touch `carts`.** `anon` writes carts by design: a guest cart
--    exists before there is an account, and its policies are the shape that
--    makes that safe.
--
-- 3. **It does not touch a column-level grant.** Production has exactly four
--    (`notifications.read_at`, and three `supplier_reply*` columns on
--    `reviews`, read from `pg_attribute.attacl` because
--    `information_schema.role_column_grants` PROJECTS a table-level grant onto
--    every column and cannot tell the two apart). Neither table is in the list
--    below, and the guard block refuses to run if that ever stops being true.
--
-- =============================================================================
-- REVERSAL
-- =============================================================================
--
--   GRANT INSERT, UPDATE, DELETE ON <relation> TO authenticated;
--
-- for any relation that turns out to need it. Reversing the whole file is
-- pointless: it would restore privileges nothing uses.

BEGIN;

-- ---------------------------------------------------------------------------
-- GUARD. Everything below rests on two properties of production, and both are
-- re-checked here rather than assumed from the 2026-09-10 reading, because a
-- migration applied later runs against a database that has moved.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  targets text[] := ARRAY[
    'abandoned_cart_nudges','ai_usage','analytics_events','cashback_ledger','coupon_codes',
    'coupon_qr_batches','coupon_qr_codes','coupons','discount_campaigns','discount_redemptions',
    'email_suppressions','escrow_holds','invoices','newsletter_subscribers','payment_events',
    'payments','referral_program_settings','refunds','search_events','seo_redirects',
    'split_executions','subscription_charges','supplier_staff','support_ticket_messages',
    'voucher_redemptions','vouchers','wallet_accounts','wallet_balances','wallet_entries',
    'wallet_transactions','whatsapp_contacts','whatsapp_inbound_messages','whatsapp_outbox',
    'v_admin_pending_queues','v_banners_live','v_homepage_sections_live','v_low_stock',
    'v_wallet_ledger'
  ];
  offender text;
BEGIN
  -- (1) A client write policy on a target means a feature now depends on the
  -- grant, and revoking would break it rather than harden it.
  SELECT string_agg(DISTINCT p.tablename, ', ')
    INTO offender
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.tablename = ANY (targets)
     AND p.permissive = 'PERMISSIVE'
     AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
     AND (p.roles::text[] && ARRAY['authenticated','public']);
  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'refusing: these targets have gained a client write policy since this file was measured: %',
      offender;
  END IF;

  -- (2) A column-level grant on a target is a feature that needs the narrow
  -- privilege. `attacl` is the only place that distinguishes one.
  SELECT string_agg(DISTINCT c.relname || '.' || a.attname, ', ')
    INTO offender
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND a.attnum > 0
     AND a.attacl IS NOT NULL
     AND c.relname = ANY (targets);
  IF offender IS NOT NULL THEN
    RAISE EXCEPTION 'refusing: column-level grants exist on targets: %', offender;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- THE REVOKES. `anon` is named alongside `authenticated` even though it holds
-- none of these today: a REVOKE of a privilege that is not held is a no-op, and
-- naming both means a future GRANT to the wrong role does not survive a re-run.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.abandoned_cart_nudges FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.analytics_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cashback_ledger FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coupon_codes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coupon_qr_batches FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coupon_qr_codes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coupons FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.discount_campaigns FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.discount_redemptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_suppressions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.escrow_holds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.newsletter_subscribers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.referral_program_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.search_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.seo_redirects FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.split_executions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_charges FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.supplier_staff FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.support_ticket_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.voucher_redemptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vouchers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_accounts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_balances FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_entries FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_contacts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_inbound_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_outbox FROM anon, authenticated;

-- The five reporting views. Read-only in every caller; SELECT is untouched.
REVOKE INSERT, UPDATE, DELETE ON public.v_admin_pending_queues FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.v_banners_live FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.v_homepage_sections_live FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.v_low_stock FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.v_wallet_ledger FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- PROOF. A REVOKE reports success whether or not the privilege was there, and
-- `has_table_privilege` answers for the role as PostgREST will use it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  targets text[] := ARRAY[
    'abandoned_cart_nudges','ai_usage','analytics_events','cashback_ledger','coupon_codes',
    'coupon_qr_batches','coupon_qr_codes','coupons','discount_campaigns','discount_redemptions',
    'email_suppressions','escrow_holds','invoices','newsletter_subscribers','payment_events',
    'payments','referral_program_settings','refunds','search_events','seo_redirects',
    'split_executions','subscription_charges','supplier_staff','support_ticket_messages',
    'voucher_redemptions','vouchers','wallet_accounts','wallet_balances','wallet_entries',
    'wallet_transactions','whatsapp_contacts','whatsapp_inbound_messages','whatsapp_outbox',
    'v_admin_pending_queues','v_banners_live','v_homepage_sections_live','v_low_stock',
    'v_wallet_ledger'
  ];
  remaining text;
  target text;
  role_name text;
  priv text;
BEGIN
  remaining := NULL;
  FOREACH target IN ARRAY targets LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH priv IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
        IF has_table_privilege(role_name, 'public.' || quote_ident(target), priv) THEN
          remaining := concat_ws(', ', remaining, role_name || ' ' || priv || ' on ' || target);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION 'DML privileges survived the revoke: %', remaining;
  END IF;

  -- And the two that must NOT have moved, because they are the ones a
  -- careless widening of this file would take out.
  IF NOT has_table_privilege('anon', 'public.carts', 'INSERT') THEN
    RAISE EXCEPTION 'anon lost INSERT on carts; guest carts are now impossible';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated lost UPDATE on notifications.read_at; the bell can no longer be marked read';
  END IF;
END
$$;

COMMIT;
