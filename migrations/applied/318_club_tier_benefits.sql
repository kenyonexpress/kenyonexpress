-- 318: C102 F11. Per-tier benefit values for the club: one row per club_tiers row.
-- cashback_percent is a whole percent (0-100), early_access_hours a whole number of
-- hours, gift_value_agorot integer agorot. No numeric or float column anywhere.
-- These are values the owner configures; nothing in checkout grants them yet, so the
-- storefront does not advertise them (see docs/C102-club.md).
-- Needs club_tiers (applied/282_club_tiers.sql or pending/164_club_tiers.sql).
-- Writes go through the service role from /admin/club-tiers; clients only read.
-- Rollback: drop table if exists public.club_tier_benefits;

create table if not exists public.club_tier_benefits (
  tier_id smallint primary key references public.club_tiers (id) on delete cascade,
  cashback_percent smallint not null default 0 check (cashback_percent between 0 and 100),
  early_access_hours integer not null default 0 check (early_access_hours between 0 and 720),
  gift_value_agorot bigint not null default 0 check (gift_value_agorot >= 0),
  updated_at timestamptz not null default now()
);

insert into public.club_tier_benefits (tier_id)
select id from public.club_tiers
on conflict (tier_id) do nothing;

alter table public.club_tier_benefits enable row level security;

drop policy if exists club_tier_benefits_read_active on public.club_tier_benefits;
create policy club_tier_benefits_read_active on public.club_tier_benefits
  for select to anon, authenticated
  using (exists (select 1 from public.club_tiers t where t.id = tier_id and t.active));

revoke insert, update, delete on public.club_tier_benefits from anon, authenticated;
grant select on public.club_tier_benefits to anon, authenticated;
