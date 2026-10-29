-- 164: compute_tier(user_id) - a customer's club tier from trailing-12-month spend.
-- C11. Tiers: bronze / silver / gold / platinum. Spend is integer agorot only.
--
-- Self-contained and idempotent: club_tiers and its seed are the same as in
-- applied/282_club_tiers.sql (create if not exists / on conflict do nothing),
-- so this file is safe whether or not 282 ran. Thresholds: Bronze 0, Silver
-- 500 ILS, Gold 2,000 ILS, Platinum 5,000 ILS.
--
-- compute_tier is SECURITY INVOKER with an empty search_path: orders RLS
-- applies, so a customer can compute only their own tier (any other id yields
-- spend 0 / lowest tier, never someone else's figure) and an admin sees all.
-- Spend = paid orders in the trailing 365 days, excluding cancelled, refunded
-- and pending, summed from the integer orders.total_ils_agorot.
-- Rollback: drop function if exists public.compute_tier(uuid);

create table if not exists public.club_tiers (
  id smallint generated always as identity primary key,
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name_he text not null check (char_length(name_he) between 1 and 40),
  min_spend_agorot bigint not null check (min_spend_agorot >= 0),
  benefits_json jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits_json) = 'array'),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.club_tiers (key, name_he, min_spend_agorot, sort_order)
values
  ('bronze', 'ארד', 0, 10),
  ('silver', 'כסף', 50000, 20),
  ('gold', 'זהב', 200000, 30),
  ('platinum', 'פלטינה', 500000, 40)
on conflict (key) do nothing;

alter table public.club_tiers enable row level security;

drop policy if exists club_tiers_read_active on public.club_tiers;
create policy club_tiers_read_active on public.club_tiers
  for select to anon, authenticated
  using (active);

revoke insert, update, delete on public.club_tiers from anon, authenticated;
grant select on public.club_tiers to anon, authenticated;

create or replace function public.compute_tier(p_user_id uuid)
returns table (
  tier_key text,
  tier_name_he text,
  spend_agorot bigint,
  next_tier_key text,
  to_next_agorot bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with spend as (
    select coalesce(sum(o.total_ils_agorot), 0)::bigint as agorot
      from public.orders o
     where o.user_id = p_user_id
       and o.paid_at is not null
       and o.paid_at >= now() - interval '365 days'
       and o.status not in ('cancelled', 'refunded', 'pending')
       and o.deleted_at is null
  )
  select t.key,
         t.name_he,
         s.agorot,
         n.key,
         case when n.key is null then 0::bigint
              else greatest(n.min_spend_agorot - s.agorot, 0)::bigint end
    from spend s
    left join lateral (
      select ct.key, ct.name_he
        from public.club_tiers ct
       where ct.active and ct.min_spend_agorot <= s.agorot
       order by ct.min_spend_agorot desc, ct.sort_order desc
       limit 1
    ) t on true
    left join lateral (
      select ct.key, ct.min_spend_agorot
        from public.club_tiers ct
       where ct.active and ct.min_spend_agorot > s.agorot
       order by ct.min_spend_agorot asc, ct.sort_order asc
       limit 1
    ) n on true;
$$;

revoke all on function public.compute_tier(uuid) from public, anon;
grant execute on function public.compute_tier(uuid) to authenticated;

comment on function public.compute_tier(uuid) is
  'Club tier for a customer from trailing-12-month paid spend (integer agorot). Security invoker: orders RLS applies.';
