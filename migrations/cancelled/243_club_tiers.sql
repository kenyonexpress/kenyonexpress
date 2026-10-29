-- 243_club_tiers.sql
--
-- F11 club tiers: a customer's tier is decided by what they spent in the last
-- 12 months. The thresholds live in a table, the spend is computed in SQL
-- (the 177/215 precedent: the database decides, TypeScript displays).
--
-- SPEND = sum(orders.customer_pays_now_agorot + orders.wallet_applied_agorot)
-- over orders in status paid / partially_fulfilled / fulfilled whose paid_at
-- falls in the trailing 12 months. Cancelled and refunded orders do not count.
-- Everything is integer agorot; no numeric column, no float.
--
-- Seed thresholds: bronze 0, silver 200000 (2,000 ILS), gold 500000 (5,000 ILS).
--
-- ROLLBACK:
--   drop function public.fn_club_tier(uuid);
--   drop function public.fn_club_spend_12mo(uuid);
--   drop table public.club_tiers;

create table if not exists public.club_tiers (
  code text primary key,
  name_he text not null,
  min_spend_agorot integer not null,
  rank smallint not null unique,
  constraint club_tiers_min_spend_nonneg check (min_spend_agorot >= 0)
);

alter table public.club_tiers enable row level security;

drop policy if exists club_tiers_read on public.club_tiers;
create policy club_tiers_read on public.club_tiers
  for select to anon, authenticated using (true);

insert into public.club_tiers (code, name_he, min_spend_agorot, rank) values
  ('bronze', 'ברונזה', 0, 1),
  ('silver', 'כסף', 200000, 2),
  ('gold', 'זהב', 500000, 3)
on conflict (code) do nothing;

create or replace function public.fn_club_spend_12mo(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(o.customer_pays_now_agorot + o.wallet_applied_agorot), 0)::integer
  from public.orders o
  where o.user_id = p_user
    and o.status in ('paid', 'partially_fulfilled', 'fulfilled')
    and o.paid_at is not null
    and o.paid_at >= now() - interval '12 months'
    and (p_user = auth.uid() or auth.role() = 'service_role');
$$;

create or replace function public.fn_club_tier(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.code
  from public.club_tiers t
  where t.min_spend_agorot <= public.fn_club_spend_12mo(p_user)
  order by t.rank desc
  limit 1;
$$;

revoke all on function public.fn_club_spend_12mo(uuid) from public, anon;
revoke all on function public.fn_club_tier(uuid) from public, anon;
grant execute on function public.fn_club_spend_12mo(uuid) to authenticated, service_role;
grant execute on function public.fn_club_tier(uuid) to authenticated, service_role;
