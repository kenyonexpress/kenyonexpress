-- 280: an append-only record of what a customer agreed to, and when.
-- rc5 F05 (listed in the goal as 194, a number already used in this repo).
-- First consumer: the "קבל הכל באפליקציה" toggle on /account/notifications.
-- One row per change, never updated: the latest row per (user_id, consent_key)
-- is the current answer, and the earlier rows are the evidence of when it
-- changed. Written by the server only (service role); a customer may read
-- their own rows and nothing else.
-- Rollback: drop table if exists public.user_consents;

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_key text not null check (consent_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  granted boolean not null,
  source text not null default 'web' check (source in ('web', 'app', 'admin')),
  ip_address inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  created_at timestamptz not null default now()
);

create index if not exists user_consents_user_key_created_idx
  on public.user_consents (user_id, consent_key, created_at desc);

alter table public.user_consents enable row level security;

drop policy if exists user_consents_select_own on public.user_consents;
create policy user_consents_select_own on public.user_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_consents from anon;
revoke insert, update, delete on public.user_consents from authenticated;
grant select on public.user_consents to authenticated;

comment on table public.user_consents is
  'Append-only consent log. Latest row per (user_id, consent_key) is current. Server writes only.';
