-- Phase 5: Per-user, per-action rate limiting
-- Append-only log of user actions; check_user_rate_limit records an attempt
-- and reports whether the user is still under the limit for the time window.
-- Note: 002_auth_rate_limits.sql keeps the IP-keyed limiter; this is additive.

create table if not exists public.user_rate_limits (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null,
  action     text        not null,
  created_at timestamptz not null default now()
);

-- No public access — accessed only via the SECURITY DEFINER function below
alter table public.user_rate_limits enable row level security;

-- Lookup by (user, action) within a recent time window
create index if not exists user_rate_limits_lookup_idx
  on public.user_rate_limits (user_id, action, created_at desc);

-- Records the current attempt, then returns true if the count within the
-- window is still within the limit. SECURITY DEFINER so RLS does not block it.
create or replace function public.check_user_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer default 100,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.user_rate_limits (user_id, action)
  values (p_user_id, p_action);

  select count(*) into v_count
  from public.user_rate_limits
  where user_id = p_user_id
    and action = p_action
    and created_at > now() - (p_window_seconds || ' seconds')::interval;

  return v_count <= p_limit;
end;
$$;

-- Periodic cleanup of old records (called manually or via cron)
create or replace function public.cleanup_user_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_rate_limits
  where created_at < now() - interval '24 hours';
$$;

-- Callers are authenticated users acting on their own behalf
grant execute on function public.check_user_rate_limit(uuid, text, integer, integer) to authenticated;
