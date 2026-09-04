-- 172: explicit RLS policies for the ten tables that carry RLS and no policy.
--
-- WHAT WAS MEASURED (pg_class x pg_policy, hosted project, 2026-09-04): ten
-- public tables have `relrowsecurity = true` and zero rows in pg_policy. RLS
-- on with no policy is already DENY for anon and authenticated, so nine of
-- the ten are closed today and this file mostly makes intent visible in the
-- schema instead of inferred from an absence — the same reasoning as 122,
-- which did this for the previous batch of five.
--
-- THE ONE REAL BUG. The admin payments page reads `payment_webhook_events`
-- through the REQUEST-scoped client (src/app/(admin)/admin/payments/page.tsx,
-- tab 'webhooks'), not the service client. With zero policies that query
-- silently returns zero rows, so the webhooks tab has been an empty table for
-- every admin. `payment_webhook_events_admin_read` below is what makes it
-- show data.
--
-- CLASSIFICATION, one line per table:
--
--   rate_limits           service-role-only counter store. The limiter runs on
--                         createAdminClient() ON PURPOSE (see the 125 story:
--                         the anon-keyed version let the attacker pick the
--                         bucket key). Client roles get a restrictive deny.
--   user_rate_limits      same store, per-user variant. Restrictive deny.
--   search_index_outbox   indexer plumbing, sibling of search_index_dlq which
--                         already carries deny_all_client_roles. Same deny.
--
--   payment_webhook_events  raw provider payloads; admin read (the bug above),
--                           writes stay service-role-only.
--   ai_usage                telemetry, no client writer in src/. Admin read.
--   analytics_events        ingested via service-role RPC only. Admin read.
--   report_orders_daily     ┐ denormalized reporting tables (170). Primary
--   report_revenue_daily    │ access is the admin-only SECURITY DEFINER RPCs;
--   report_top_products     │ a direct admin SELECT matches the pattern set by
--   report_cohort_retention ┘ discount_campaigns/abandoned_cart_nudges.
--
-- Effective-permission delta: admins gain SELECT on the seven admin-read
-- tables. Nothing else changes; the denies are already the default and the
-- service role bypasses RLS either way.
--
-- Rollback: `drop policy <name> on public.<table>` per policy.

do $$
declare
  t text;
begin
  -- ── restrictive deny for the plumbing ──────────────────────────────────
  foreach t in array array[
    'rate_limits',
    'user_rate_limits',
    'search_index_outbox'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, table not present', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Idempotent: CREATE POLICY has no IF NOT EXISTS, so it is never written bare.
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

  -- ── admin-only SELECT for the observational tables ─────────────────────
  foreach t in array array[
    'payment_webhook_events',
    'ai_usage',
    'analytics_events',
    'report_orders_daily',
    'report_revenue_daily',
    'report_top_products',
    'report_cohort_retention'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, table not present', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    if not exists (
      select 1 from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and p.polname = t || '_admin_read'
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_admin())',
        t || '_admin_read', t
      );
    end if;
  end loop;

  -- The four report tables were created (170) with all client grants revoked,
  -- so the policy above is inert on them without a table-level grant. RLS is
  -- what narrows the rows to admins; the grant only opens the door PostgREST
  -- checks first. Measured: the other three admin-read tables already carry
  -- SELECT for authenticated.
  foreach t in array array[
    'report_orders_daily',
    'report_revenue_daily',
    'report_top_products',
    'report_cohort_retention'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end
$$;
