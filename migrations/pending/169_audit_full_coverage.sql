-- 169: audit_log full coverage — before/after/request_id, and AFTER triggers
-- on every financial and user table.
--
-- What existed before this migration (149, and app writes through
-- src/lib/admin/audit.ts): the audit_log table, an append-only guard (149),
-- an IP retention carve-out (157), and audit_log_trigger_fn attached to six
-- tables only: coupons, coupon_deals, payout_statements, products, profiles,
-- vendors. Every money-path table — orders, payments, refunds, the wallet
-- ledger, vouchers — changed with no database-level trail; only the admin
-- server actions wrote audit rows, and only for their own mutations.
--
-- What this migration does:
--   1. entity_id uuid -> text. The trigger becomes generic over any primary
--      key (referral_program_settings has a boolean id; a future table may
--      have a bigint). uuid-typed INSERTs from existing definer functions
--      still assign fine (I/O coercion applies in assignment context), and
--      the TS type is `string` either way.
--   2. New columns: before jsonb, after jsonb (full row snapshots, redacted),
--      request_id text (correlates with the x-request-id the app already
--      mints in src/lib/observability/request-id.ts and echoes on responses).
--      `changes` keeps its {old,new} shape: src/lib/admin/audit-diff.ts and
--      the admin audit page read it, and old rows already hold it.
--   3. audit_log_trigger_fn v2: row id read via to_jsonb() so the function
--      compiles for any table; ip/user_agent/request_id read from PostgREST's
--      request.headers GUC (null on direct connections — an audit row with no
--      IP beats a mutation that fails looking for one, same stance as
--      writeAuditLog); secret-bearing columns stripped from snapshots.
--   4. AFTER INSERT OR UPDATE OR DELETE triggers on 28 more tables (list in
--      the DO block below). Deliberately excluded, with reasons:
--        carts, stock_reservations, rate_limits, user_rate_limits — high-churn
--          operational state, not money and not identity; auditing them would
--          bury the signal.
--        search_*, analytics_events, popular_searches, user_recent_searches,
--          notification_outbox, search_index_outbox/dlq, ai_usage — telemetry
--          and queues.
--        reviews, wishlists, push_tokens — user content/device state, no
--          financial or privilege consequence.
--        audit_log itself — a trigger that inserts into its own table
--          recurses.
--        wallet_balances, wallet_transactions — DEPRECATED (052), empty,
--          write-blocked.
--        legacy_percent_archive_112 — read-only history.
--
-- The append-only guard (149) and the IP retention carve-out (157) are
-- untouched and keep working: the carve-out compares to_jsonb(NEW/OLD) minus
-- ip_address, which is shape-agnostic.
--
-- NOTE for 148_orders_monthly_partitioning (pending, unapplied): if orders is
-- ever recreated as a partitioned table, audit_orders must be recreated on
-- the new parent. Row triggers on a partitioned parent propagate to
-- partitions, so `create trigger audit_orders ... on public.orders` again is
-- all it takes.

-- 1. entity_id becomes text (568 rows; index idx_audit_log_entity rebuilds).
alter table public.audit_log
  alter column entity_id type text using entity_id::text;

-- 2. New columns.
alter table public.audit_log
  add column if not exists before jsonb,
  add column if not exists after jsonb,
  add column if not exists request_id text;

comment on column public.audit_log.before is
  'Full row snapshot before the change (UPDATE/DELETE), secret columns stripped. Null for INSERT.';
comment on column public.audit_log.after is
  'Full row snapshot after the change (INSERT/UPDATE), secret columns stripped. Null for DELETE.';
comment on column public.audit_log.request_id is
  'x-request-id of the HTTP request that made the change, when the write came through PostgREST with the header forwarded. Correlates with application logs.';

create index if not exists idx_audit_log_request_id
  on public.audit_log (request_id)
  where request_id is not null;

-- 3. The trigger function, generic over any table.
create or replace function public.audit_log_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  hdrs jsonb;
  v_before jsonb;
  v_after jsonb;
  v_ip inet;
  -- Columns whose values must never sit in an audit snapshot, by name across
  -- all audited tables: payment_tokens.cardcom_token, supplier_staff.pin_hash,
  -- and any token/secret column a future table adds under these names.
  v_redact constant text[] := array
    ['cardcom_token', 'pin_hash', 'token_hash', 'confirm_token', 'unsubscribe_token', 'secret'];
begin
  -- PostgREST publishes the HTTP headers of the current request as a JSON
  -- GUC. Absent (direct connection, pg_cron, psql) it is null, and every
  -- derived field degrades to null with it.
  begin
    hdrs := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    hdrs := null;
  end;

  -- First hop of x-forwarded-for, same as getClientIp and writeAuditLog: on
  -- Vercel the platform overwrites the header, so hop one is the client. A
  -- value inet cannot parse becomes null rather than failing the mutation
  -- being audited.
  begin
    v_ip := nullif(trim(split_part(
      coalesce(hdrs->>'x-forwarded-for', hdrs->>'x-real-ip', ''), ',', 1)), '')::inet;
  exception when others then
    v_ip := null;
  end;

  if tg_op in ('UPDATE', 'DELETE') then
    v_before := to_jsonb(old) - v_redact;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := to_jsonb(new) - v_redact;
  end if;

  insert into public.audit_log
    (actor_id, actor_role, action, entity_type, entity_id,
     changes, before, after, ip_address, user_agent, request_id)
  values (
    auth.uid(),
    public.current_user_role()::text,
    (case tg_op
       when 'INSERT' then 'created'
       when 'UPDATE' then 'updated'
       when 'DELETE' then 'deleted'
     end)::public.audit_action,
    tg_table_name::text,
    -- Read through jsonb rather than NEW.id so the function plans for tables
    -- whose primary key is not a uuid column named id. entity_id is NOT NULL;
    -- a table with no id column at all records ''.
    coalesce(v_after->>'id', v_before->>'id', ''),
    case tg_op
      when 'INSERT' then jsonb_build_object('new', v_after)
      when 'UPDATE' then jsonb_build_object('old', v_before, 'new', v_after)
      when 'DELETE' then jsonb_build_object('old', v_before)
    end,
    v_before,
    v_after,
    v_ip,
    left(hdrs->>'user-agent', 500),
    left(hdrs->>'x-request-id', 128)
  );
  return null;
end;
$$;

-- 4. Attach to every financial and user table not already covered.
--    (coupons, coupon_deals, payout_statements, products, profiles, vendors
--    have carried audit_* triggers since 011/149; replacing the function
--    above upgraded them in place.)
do $$
declare
  t text;
begin
  foreach t in array array[
    -- money path
    'orders', 'order_items', 'payments', 'payment_tokens', 'payment_events',
    'refunds', 'invoices', 'wallet_accounts', 'wallet_entries', 'escrow_holds',
    'split_executions', 'settlement_events', 'payout_statement_lines',
    'vouchers', 'voucher_redemptions', 'subscriptions', 'subscription_charges',
    'discount_campaigns', 'discount_redemptions', 'coupon_codes',
    'cashback_rules',
    -- identity and privilege
    'user_addresses', 'supplier_members', 'supplier_staff', 'referrals',
    'affiliates', 'newsletter_subscribers', 'email_suppressions'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      || 'for each row execute function public.audit_log_trigger_fn()',
      'audit_' || t, t);
  end loop;
end $$;
