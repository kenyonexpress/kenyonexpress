-- 188_affiliate.sql
--
-- G110 / F12 affiliate programme, per docs/ARCHITECTURE-AFFILIATES-REFERRALS.md:
-- campaigns, per-affiliate links, clicks, conversions, and payout as WALLET
-- CREDIT (no bank withdrawal). Extends public.affiliates (010); adds no
-- column to it.
--
-- MONEY: integer agorot only. Commission rates are integer basis points
-- (campaign.commission_bp, 1000 = 10%). The rate is SNAPSHOTTED on the
-- conversion row at the moment the order converts, so editing a campaign later
-- never rewrites history. The platform share the commission is taken from is
-- computed by the server with src/lib/money.ts and passed in as agorot; the
-- database only does integer arithmetic on it. The one numeric is the
-- fn_wallet_transfer call (its contract is p_amount_ils; agorot/100 is exact).
--
-- PAYOUT: fn_affiliate_pay_conversion moves platform:cashback_reserve ->
-- the affiliate's wallet account, idempotency key affiliate:<conversion>:payout.
--
-- ROLLBACK:
--   drop function public.fn_affiliate_pay_conversion(uuid);
--   drop function public.fn_affiliate_record_conversion(uuid, text, integer);
--   drop table public.affiliate_conversions, public.affiliate_clicks,
--              public.affiliate_links, public.affiliate_campaigns;

create table if not exists public.affiliate_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_he text not null,
  commission_bp integer not null,
  cookie_days integer not null default 30,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint affiliate_campaigns_bp_range check (commission_bp between 0 and 10000),
  constraint affiliate_campaigns_cookie_range check (cookie_days between 1 and 365)
);

create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  campaign_id uuid not null references public.affiliate_campaigns(id) on delete cascade,
  slug text not null unique,
  created_at timestamptz not null default now(),
  unique (affiliate_id, campaign_id)
);

create table if not exists public.affiliate_clicks (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.affiliate_links(id) on delete cascade,
  visitor_hash text,
  landing_path text,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_clicks_link_created
  on public.affiliate_clicks (link_id, created_at desc);

create table if not exists public.affiliate_conversions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique,
  link_id uuid not null references public.affiliate_links(id),
  affiliate_id uuid not null references public.affiliates(id),
  campaign_id uuid not null references public.affiliate_campaigns(id),
  basis_agorot integer not null,
  commission_bp integer not null,
  commission_agorot integer not null,
  status text not null default 'pending',
  wallet_entry_id uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint affiliate_conversions_status check (status in ('pending', 'paid', 'void')),
  constraint affiliate_conversions_nonneg check (basis_agorot >= 0 and commission_agorot >= 0)
);
create index if not exists affiliate_conversions_affiliate
  on public.affiliate_conversions (affiliate_id, created_at desc);

alter table public.affiliate_campaigns enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_conversions enable row level security;

-- Campaigns are public reads (a link page names its campaign). Everything else
-- is visible only to the owning affiliate; all writes are service role.
drop policy if exists affiliate_campaigns_read on public.affiliate_campaigns;
create policy affiliate_campaigns_read on public.affiliate_campaigns
  for select to anon, authenticated using (active);

drop policy if exists affiliate_links_own on public.affiliate_links;
create policy affiliate_links_own on public.affiliate_links
  for select to authenticated
  using (affiliate_id in (select a.id from public.affiliates a where a.user_id = (select auth.uid())));

drop policy if exists affiliate_clicks_own on public.affiliate_clicks;
create policy affiliate_clicks_own on public.affiliate_clicks
  for select to authenticated
  using (link_id in (
    select l.id from public.affiliate_links l
    join public.affiliates a on a.id = l.affiliate_id
    where a.user_id = (select auth.uid())));

drop policy if exists affiliate_conversions_own on public.affiliate_conversions;
create policy affiliate_conversions_own on public.affiliate_conversions
  for select to authenticated
  using (affiliate_id in (select a.id from public.affiliates a where a.user_id = (select auth.uid())));

-- Record a conversion for an order that arrived through a link. Idempotent on
-- order_id. Self-referral (affiliate buys through own link) is refused.
create or replace function public.fn_affiliate_record_conversion(
  p_order_id uuid,
  p_link_slug text,
  p_platform_share_agorot integer
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link public.affiliate_links%rowtype;
  v_camp public.affiliate_campaigns%rowtype;
  v_aff public.affiliates%rowtype;
  v_buyer uuid;
  v_commission integer;
  v_id uuid;
begin
  if p_platform_share_agorot is null or p_platform_share_agorot < 0 then
    raise exception 'invalid platform share';
  end if;

  select id into v_id from public.affiliate_conversions where order_id = p_order_id;
  if v_id is not null then return v_id; end if;

  select * into v_link from public.affiliate_links where slug = p_link_slug;
  if not found then return null; end if;
  select * into v_camp from public.affiliate_campaigns where id = v_link.campaign_id;
  if not found or not v_camp.active then return null; end if;
  select * into v_aff from public.affiliates where id = v_link.affiliate_id;
  if not found or v_aff.status::text <> 'approved' or v_aff.deleted_at is not null then
    return null;
  end if;

  select o.user_id into v_buyer from public.orders o where o.id = p_order_id;
  if v_buyer is not null and v_buyer = v_aff.user_id then return null; end if;

  -- integer half-up: (share * bp + 5000) / 10000
  v_commission := ((p_platform_share_agorot::bigint * v_camp.commission_bp + 5000) / 10000)::integer;

  insert into public.affiliate_conversions
    (order_id, link_id, affiliate_id, campaign_id, basis_agorot, commission_bp, commission_agorot)
  values
    (p_order_id, v_link.id, v_aff.id, v_camp.id, p_platform_share_agorot, v_camp.commission_bp, v_commission)
  on conflict (order_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Pay one pending conversion into the affiliate's wallet. Idempotent.
create or replace function public.fn_affiliate_pay_conversion(p_conversion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conv public.affiliate_conversions%rowtype;
  v_user uuid;
  v_user_acct uuid;
  v_reserve_acct uuid;
  v_entry uuid;
begin
  select * into v_conv from public.affiliate_conversions where id = p_conversion_id for update;
  if not found then raise exception 'conversion not found'; end if;
  if v_conv.status = 'paid' then return v_conv.wallet_entry_id; end if;
  if v_conv.status <> 'pending' then raise exception 'conversion is %', v_conv.status; end if;

  if v_conv.commission_agorot > 0 then
    select user_id into v_user from public.affiliates where id = v_conv.affiliate_id;
    select id into v_user_acct from public.wallet_accounts where user_id = v_user;
    select id into v_reserve_acct from public.wallet_accounts where code = 'platform:cashback_reserve';
    if v_user_acct is null or v_reserve_acct is null then
      raise exception 'wallet accounts unavailable for affiliate payout %', p_conversion_id;
    end if;
    v_entry := public.fn_wallet_transfer(
      v_reserve_acct, v_user_acct,
      (v_conv.commission_agorot::numeric / 100), 'affiliate_commission',
      'affiliate:' || p_conversion_id::text || ':payout', v_conv.order_id);
  end if;

  update public.affiliate_conversions
     set status = 'paid', wallet_entry_id = v_entry, paid_at = now()
   where id = p_conversion_id;
  return v_entry;
end;
$$;

revoke all on function public.fn_affiliate_record_conversion(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.fn_affiliate_pay_conversion(uuid) from public, anon, authenticated;
grant execute on function public.fn_affiliate_record_conversion(uuid, text, integer) to service_role;
grant execute on function public.fn_affiliate_pay_conversion(uuid) to service_role;

-- Verification (run after apply):
--   select count(*) from public.affiliate_campaigns;                       -- 0
--   select proname from pg_proc where proname like 'fn_affiliate_%';       -- 2 rows
