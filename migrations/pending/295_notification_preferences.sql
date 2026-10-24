-- 295: notification_preferences table for granular email and in-app notification toggles
-- C64: Email prefs /account/notifications granular toggles + app-only mega-toggle with recorded consent
-- Records user preferences for different types of notifications.
-- Works with user_consents (280) for consent evidence.
-- Rollback: drop table if exists public.notification_preferences;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Email notifications (default true for transactional, false for marketing per anti-spam law 30A)
  order_updates_email boolean not null default true,
  coupon_expiry_email boolean not null default true,
  wallet_activity_email boolean not null default false,
  marketing_email boolean not null default false,
  -- In-app/push notifications mega-toggle
  all_in_app boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Updated at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists set_updated_at on public.notification_preferences;
create trigger set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- Auto-create preferences row for new users
create or replace function public.create_notification_preferences()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_notification_prefs on auth.users;
create trigger create_notification_prefs
  after insert on auth.users
  for each row execute function public.create_notification_preferences();

-- Backfill existing users
insert into public.notification_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- RLS
alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role can read/write for system operations
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update on public.notification_preferences to service_role;

comment on table public.notification_preferences is
  'User preferences for email and in-app notifications. One row per user, upserted on toggle.';

comment on column public.notification_preferences.all_in_app is
  'Mega-toggle for all in-app/push notifications (order updates, coupons, promotions).';
