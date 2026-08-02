-- Phase 2: Auth rate limiting
-- Tracks failed auth attempts per IP to prevent brute force

create table if not exists public.rate_limits (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  attempts     integer not null default 1,
  window_start timestamptz not null default now()
);

-- No public access — accessed only via SECURITY DEFINER function
alter table public.rate_limits enable row level security;

create index if not exists rate_limits_key_idx on public.rate_limits (key);
-- Clean up old windows automatically
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- Atomically check and increment rate limit.
-- Returns true if the request is allowed, false if limit exceeded.
create or replace function public.check_rate_limit(
  p_key text,
  p_max_attempts integer default 10,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  insert into public.rate_limits (key, attempts, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    attempts = case
      when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        then 1                              -- reset expired window
        else rate_limits.attempts + 1       -- increment within window
    end,
    window_start = case
      when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
        then now()
        else rate_limits.window_start
    end
  returning attempts into v_attempts;

  return v_attempts <= p_max_attempts;
end;
$$;

-- Periodic cleanup of old rate limit records (called manually or via cron)
create or replace function public.cleanup_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits
  where window_start < now() - interval '2 hours';
$$;
