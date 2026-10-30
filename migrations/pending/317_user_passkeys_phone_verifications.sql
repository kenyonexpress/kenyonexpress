-- 317: C100 F15. `user_passkeys` and `user_phone_verifications`.
-- Passkeys already live in public.webauthn_credentials (the routes read and write it);
-- a second table would split the credentials, so `user_passkeys` is a read view over it.
-- `user_phone_verifications` is the evidence log of verified phones (channel + time).
-- Rollback: drop view if exists public.user_passkeys; drop table if exists public.user_phone_verifications;

create or replace view public.user_passkeys
with (security_invoker = true) as
select id, user_id, counter, transports, device_type, backed_up, friendly_name, last_used_at
from public.webauthn_credentials;

create table if not exists public.user_phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  purpose text not null default 'sign_in' check (purpose in ('sign_in', 'verify')),
  verified_at timestamptz not null default now()
);

create index if not exists user_phone_verifications_user_idx
  on public.user_phone_verifications (user_id, verified_at desc);

alter table public.user_phone_verifications enable row level security;
revoke all on public.user_phone_verifications from anon, authenticated;
grant select on public.user_phone_verifications to authenticated;
create policy user_phone_verifications_own_read on public.user_phone_verifications
  for select to authenticated using (user_id = (select auth.uid()));

-- channel the code was sent on, so verify can record how the phone was proven
alter table public.auth_wa_otps
  add column if not exists channel text not null default 'whatsapp'
  check (channel in ('whatsapp', 'sms', 'email'));
