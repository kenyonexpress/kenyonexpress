-- 299: Cookie consent tracking table for granular consent preferences
-- C63: Cookie banner Accept + Reject + Settings with per-category consent
-- Tracks both anonymous (via session ID) and authenticated user preferences
-- Categories: essential (always true), analytics, marketing
-- Rollback: drop table if exists public.cookie_consent;

create table if not exists public.cookie_consent (
  id uuid primary key default gen_random_uuid(),
  -- Either session_id OR user_id must be set (never both)
  session_id text check (session_id is null or char_length(session_id) between 16 and 128),
  user_id uuid references auth.users (id) on delete cascade,
  -- Granular consent flags
  essential boolean not null default true, -- Always true, included for completeness
  analytics boolean not null default false, -- GA4, PostHog
  marketing boolean not null default false, -- Meta Pixel, ad platforms
  -- Metadata
  wording_version int not null default 2 check (wording_version > 0),
  source text not null default 'web' check (source in ('web', 'app')),
  ip_address inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Constraints
  check (
    (session_id is not null and user_id is null) or
    (session_id is null and user_id is not null)
  )
);

-- Index for looking up current consent by session or user
create index if not exists cookie_consent_session_idx
  on public.cookie_consent (session_id, created_at desc)
  where session_id is not null;

create index if not exists cookie_consent_user_idx
  on public.cookie_consent (user_id, created_at desc)
  where user_id is not null;

-- Enable RLS
alter table public.cookie_consent enable row level security;

-- Anonymous users can read/write their own session records
drop policy if exists cookie_consent_anon_select on public.cookie_consent;
create policy cookie_consent_anon_select on public.cookie_consent
  for select to anon
  using (session_id is not null);

drop policy if exists cookie_consent_anon_insert on public.cookie_consent;
create policy cookie_consent_anon_insert on public.cookie_consent
  for insert to anon
  with check (session_id is not null and user_id is null);

-- Authenticated users can read/write their own records
drop policy if exists cookie_consent_auth_select on public.cookie_consent;
create policy cookie_consent_auth_select on public.cookie_consent
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists cookie_consent_auth_insert on public.cookie_consent;
create policy cookie_consent_auth_insert on public.cookie_consent
  for insert to authenticated
  with check (user_id = (select auth.uid()) and session_id is null);

comment on table public.cookie_consent is
  'Granular cookie consent preferences per session or user. Latest row is current state.';

comment on column public.cookie_consent.essential is
  'Essential cookies (always true). Auth, cart, security.';

comment on column public.cookie_consent.analytics is
  'Analytics consent. GA4, PostHog, performance monitoring.';

comment on column public.cookie_consent.marketing is
  'Marketing consent. Meta Pixel, ad platforms, remarketing.';
