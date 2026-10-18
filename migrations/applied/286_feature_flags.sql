-- 286: runtime feature flags the owner can flip without a deploy (rc5 F19;
-- the goal listed it as 200, a number already used in this repo).
-- First flag: maintenance_mode, seeded false. The proxy reads it (cached
-- 30 seconds per instance) in addition to the MAINTENANCE_MODE env switch.
--
-- Flags are readable by anyone, on purpose: the proxy reads them with the
-- anon key on every instance, and nothing that belongs in a secret belongs
-- in this table. Writes are the service role's (the admin panel's action).
-- Rollback: drop table if exists public.feature_flags;

create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  bool_value boolean,
  json_value jsonb,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, bool_value)
values ('maintenance_mode', false)
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.feature_flags from anon, authenticated;
grant select on public.feature_flags to anon, authenticated;

comment on table public.feature_flags is
  'Runtime flags, world-readable by design (no secrets). maintenance_mode drives the proxy.';
