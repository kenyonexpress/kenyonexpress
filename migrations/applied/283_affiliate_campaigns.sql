-- 283: affiliate campaigns, links, clicks, attributions and payouts.
-- rc5 F12, per docs/AFFILIATE-DESIGN.md (the goal listed it as 197, a number
-- already used in this repo). Builds on the live `affiliates` table.
-- migrations/pending/189_affiliate_program.sql is NOT this: it re-creates
-- `affiliates`, which already exists, and would stop on the first statement.
--
-- Money: commission_bp is basis points (0..5000), snapshotted per order into
-- affiliate_attributions the way platform_percent is snapshotted into
-- order_items; every amount is integer agorot.
-- Writes are server-only (service role). An affiliate reads their own rows
-- through the affiliates.user_id join; anon reads nothing.
-- Rollback: drop table if exists public.affiliate_payouts, public.affiliate_attributions,
--           public.affiliate_clicks, public.affiliate_links, public.affiliate_campaigns;

create table if not exists public.affiliate_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  commission_bp integer not null check (commission_bp between 0 and 5000),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  campaign_id uuid not null references public.affiliate_campaigns (id) on delete restrict,
  code text not null unique check (code ~ '^[a-z0-9]{6,24}$'),
  target_path text not null default '/' check (target_path ~ '^/[^/]'
    or target_path = '/'),
  created_at timestamptz not null default now(),
  unique (affiliate_id, campaign_id, target_path)
);

create table if not exists public.affiliate_clicks (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.affiliate_links (id) on delete cascade,
  ip_hash text not null check (char_length(ip_hash) = 64),
  click_day date not null default current_date,
  landing_path text check (landing_path is null or char_length(landing_path) <= 300),
  referer text check (referer is null or char_length(referer) <= 300),
  created_at timestamptz not null default now(),
  -- One counted click per visitor per link per day: refreshing is not traffic.
  unique (link_id, ip_hash, click_day)
);

create table if not exists public.affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  affiliate_id uuid not null references public.affiliates (id) on delete restrict,
  campaign_id uuid not null references public.affiliate_campaigns (id) on delete restrict,
  link_id uuid references public.affiliate_links (id) on delete set null,
  commission_bp integer not null check (commission_bp between 0 and 5000),
  base_agorot bigint check (base_agorot is null or base_agorot >= 0),
  commission_agorot bigint check (commission_agorot is null or commission_agorot >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'reversed')),
  reversal_reason text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists affiliate_attributions_pending_idx
  on public.affiliate_attributions (created_at) where status = 'pending';

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete restrict,
  attribution_id uuid not null unique references public.affiliate_attributions (id) on delete restrict,
  amount_agorot bigint not null check (amount_agorot > 0),
  idempotency_key text not null unique,
  destination text not null default 'wallet' check (destination in ('wallet')),
  created_at timestamptz not null default now()
);

alter table public.affiliate_campaigns enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_attributions enable row level security;
alter table public.affiliate_payouts enable row level security;

revoke all on public.affiliate_campaigns, public.affiliate_links, public.affiliate_clicks,
  public.affiliate_attributions, public.affiliate_payouts from anon;
revoke insert, update, delete on public.affiliate_campaigns, public.affiliate_links,
  public.affiliate_clicks, public.affiliate_attributions, public.affiliate_payouts from authenticated;
grant select on public.affiliate_campaigns, public.affiliate_links, public.affiliate_clicks,
  public.affiliate_attributions, public.affiliate_payouts to authenticated;

drop policy if exists affiliate_campaigns_read on public.affiliate_campaigns;
create policy affiliate_campaigns_read on public.affiliate_campaigns
  for select to authenticated using (active or (select is_admin()));

drop policy if exists affiliate_links_own on public.affiliate_links;
create policy affiliate_links_own on public.affiliate_links
  for select to authenticated using (
    (select is_admin()) or exists (
      select 1 from public.affiliates a
       where a.id = affiliate_links.affiliate_id and a.user_id = (select auth.uid())));

drop policy if exists affiliate_clicks_own on public.affiliate_clicks;
create policy affiliate_clicks_own on public.affiliate_clicks
  for select to authenticated using (
    (select is_admin()) or exists (
      select 1 from public.affiliate_links l join public.affiliates a on a.id = l.affiliate_id
       where l.id = affiliate_clicks.link_id and a.user_id = (select auth.uid())));

drop policy if exists affiliate_attributions_own on public.affiliate_attributions;
create policy affiliate_attributions_own on public.affiliate_attributions
  for select to authenticated using (
    (select is_admin()) or exists (
      select 1 from public.affiliates a
       where a.id = affiliate_attributions.affiliate_id and a.user_id = (select auth.uid())));

drop policy if exists affiliate_payouts_own on public.affiliate_payouts;
create policy affiliate_payouts_own on public.affiliate_payouts
  for select to authenticated using (
    (select is_admin()) or exists (
      select 1 from public.affiliates a
       where a.id = affiliate_payouts.affiliate_id and a.user_id = (select auth.uid())));

-- Seeded INACTIVE: the rate is the owner's decision, so no commission accrues
-- until someone opens /admin/affiliates, sets it and switches the campaign on.
insert into public.affiliate_campaigns (name, commission_bp, active)
select 'כללי', 500, false
 where not exists (select 1 from public.affiliate_campaigns);
