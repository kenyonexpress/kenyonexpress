-- 282: club tiers as data, and each customer's current tier as a view.
-- rc5 F11 (the goal listed it as 196, a number already used in this repo).
--
-- club_tiers replaces the code constants in src/lib/club/tiers.ts so the owner
-- can rename a tier and write its benefits from the admin panel. Seeded with
-- the goal's thresholds: Bronze 0, Silver 500 ILS, Gold 2,000 ILS, Platinum
-- 5,000 ILS (integer agorot). Benefits start empty: nothing in checkout grants
-- one yet, and listing a benefit the system does not apply would be a false
-- promise, so the owner fills them in when they exist.
--
-- v_user_tier is SECURITY INVOKER: it reads orders under the caller's RLS, so
-- a customer gets their own row and nothing else, and an admin gets everyone.
-- Spend = paid orders in the trailing 365 days, excluding cancelled and
-- refunded, summed from the integer orders.total_ils_agorot.
-- Rollback: drop view if exists public.v_user_tier; drop table if exists public.club_tiers;

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

create or replace view public.v_user_tier
with (security_invoker = true) as
with spend as (
  select o.user_id,
         coalesce(sum(o.total_ils_agorot), 0)::bigint as spend_agorot
    from public.orders o
   where o.user_id is not null
     and o.paid_at is not null
     and o.paid_at >= now() - interval '365 days'
     and o.status not in ('cancelled', 'refunded', 'pending')
     and o.deleted_at is null
   group by o.user_id
)
select s.user_id,
       s.spend_agorot,
       t.key as tier_key,
       t.name_he as tier_name_he,
       t.min_spend_agorot as tier_min_spend_agorot,
       t.benefits_json as tier_benefits_json,
       n.key as next_tier_key,
       n.name_he as next_tier_name_he,
       greatest(coalesce(n.min_spend_agorot - s.spend_agorot, 0), 0)::bigint as to_next_agorot
  from spend s
  left join lateral (
    select * from public.club_tiers ct
     where ct.active and ct.min_spend_agorot <= s.spend_agorot
     order by ct.min_spend_agorot desc, ct.sort_order desc
     limit 1
  ) t on true
  left join lateral (
    select * from public.club_tiers ct
     where ct.active and ct.min_spend_agorot > s.spend_agorot
     order by ct.min_spend_agorot asc, ct.sort_order asc
     limit 1
  ) n on true;

revoke all on public.v_user_tier from anon;
grant select on public.v_user_tier to authenticated;

comment on view public.v_user_tier is
  'Current club tier per customer (security invoker: orders RLS applies). No row = no paid spend yet.';
