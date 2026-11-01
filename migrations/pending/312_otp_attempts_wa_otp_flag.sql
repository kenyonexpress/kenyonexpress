-- 312: otp_attempts audit table + wa_otp_enabled flag (C90, rc5 F15).
-- otp_attempts records every WhatsApp/email sign-in code send and verify, so
-- abuse and Meta delivery problems can be read back. Only a phone HMAC and the
-- last 4 digits are stored, never the number or the code. Server-only: RLS on,
-- no policies, nothing granted to anon or authenticated.
-- wa_otp_enabled is seeded OFF: WhatsApp sign-in stays dark until Meta business
-- verification and template approval are done. FLAG_WA_OTP_ENABLED=1 overrides.
--
-- Rollback:
--   delete from public.feature_flags where key = 'wa_otp_enabled';
--   drop table if exists public.otp_attempts;

create table if not exists public.otp_attempts (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null check (char_length(phone_hash) = 64),
  phone_suffix text not null check (phone_suffix ~ '^[0-9]{4}$'),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('send', 'verify')),
  channel text not null check (channel in ('whatsapp', 'email')),
  outcome text not null check (
    outcome in ('sent', 'fallback_email', 'send_failed', 'rate_limited', 'ok', 'wrong_code', 'expired')
  ),
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists otp_attempts_phone_created_idx
  on public.otp_attempts (phone_hash, created_at desc);

alter table public.otp_attempts enable row level security;
revoke all on public.otp_attempts from anon, authenticated;

comment on table public.otp_attempts is
  'Audit of WhatsApp/email sign-in code sends and verifies (phone HMAC + last 4 only). Server-only.';

insert into public.feature_flags (key, bool_value)
values ('wa_otp_enabled', false)
on conflict (key) do nothing;
