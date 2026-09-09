-- 130: explicit deny-all on the five server-only tables that carry RLS and no policy.
-- ROLLBACK: drop policy deny_all_client_roles on each table below.
--
-- WHAT THE AUDIT FOUND, AND WHY IT IS NOT A HOLE
--
-- Eight public tables have `relrowsecurity = true` and zero rows in pg_policy:
--
--   payment_webhook_events   rate_limits   user_rate_limits          <- known, by design
--   legacy_percent_archive_112   referral_signals   search_index_dlq
--   settlement_events   stock_reservations                           <- the five below
--
-- RLS enabled with no policy is already DENY for anon and authenticated:
-- Postgres returns zero rows and rejects every write when no policy grants it.
-- The five tables are therefore closed today, and this migration changes no
-- effective permission. It is written so that intent is visible in the schema
-- rather than inferred from an absence, and so the audit query that flags
-- "RLS on, policies 0" stops reporting a state nobody has classified.
--
-- Every one of the five is written only by the service role, which BYPASSES RLS
-- and is unaffected by a policy of any kind:
--
--   legacy_percent_archive_112  archive of the pre-112 commission columns. Read
--                               by nothing in src/. Never customer-facing.
--   referral_signals            append-only attribution signals, written by the
--                               referral server actions on the service key.
--   search_index_dlq            dead letters from the search indexer. Operator
--                               data; leaking it would leak product internals.
--   settlement_events           money-path ledger of supplier settlement. Read
--                               by admin server actions on the service key.
--   stock_reservations          the oversell guard. Written inside the checkout
--                               transaction, never from a browser.
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition; the route to
-- production is MCP `apply_migration` after a human approves this file.

do $$
declare
  t text;
begin
  foreach t in array array[
    'legacy_percent_archive_112',
    'referral_signals',
    'search_index_dlq',
    'settlement_events',
    'stock_reservations'
  ]
  loop
    -- Idempotent: re-running must not raise. The project rule on CREATE POLICY
    -- is that it is never written bare, because it has no IF NOT EXISTS.
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, table not present', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    if not exists (
      select 1 from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and p.polname = 'deny_all_client_roles'
    ) then
      execute format(
        'create policy deny_all_client_roles on public.%I as restrictive to anon, authenticated using (false) with check (false)',
        t
      );
    end if;
  end loop;
end
$$;
