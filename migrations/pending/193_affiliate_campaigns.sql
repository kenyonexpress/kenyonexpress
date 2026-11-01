-- Migration 193: Affiliate campaigns tracking
-- Creates tables for managing affiliate campaigns and tracking clicks/conversions

create table if not exists affiliate_campaigns (
  id bigint primary key generated always as identity,
  slug text not null unique,
  name text not null,
  commission_rate integer not null, -- basis points (0-5000)
  cookie_days integer not null default 30,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),

  constraint commission_rate_range check (commission_rate >= 0 and commission_rate <= 5000),
  constraint cookie_days_positive check (cookie_days > 0)
);

create table if not exists affiliate_clicks (
  id bigint primary key generated always as identity,
  campaign_id bigint not null references affiliate_campaigns(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  order_id bigint references orders(id) on delete set null,
  clicked_at timestamp with time zone not null default now(),
  converted_at timestamp with time zone,
  commission_agorot integer, -- integer representing shekels * 100

  constraint order_xor_user check ((order_id is not null)::int + (user_id is not null)::int <= 1)
);

-- Indexes
create index if not exists affiliate_clicks_campaign_id on affiliate_clicks(campaign_id);
create index if not exists affiliate_clicks_user_id on affiliate_clicks(user_id);
create index if not exists affiliate_clicks_order_id on affiliate_clicks(order_id);
create index if not exists affiliate_clicks_clicked_at on affiliate_clicks(clicked_at);
create index if not exists affiliate_campaigns_slug on affiliate_campaigns(slug);
create index if not exists affiliate_campaigns_active on affiliate_campaigns(active);

-- RLS Policies
alter table affiliate_campaigns enable row level security;
alter table affiliate_clicks enable row level security;

-- Public can read active campaigns
create policy "campaigns_public_read" on affiliate_campaigns
  for select using (active = true);

-- Admin can manage all campaigns (assumed through service role or admin flag)
create policy "campaigns_admin_all" on affiliate_campaigns
  for all using (
    exists(
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Clicks are admin-readable, no direct user writes
create policy "clicks_admin_read" on affiliate_clicks
  for select using (
    exists(
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );
