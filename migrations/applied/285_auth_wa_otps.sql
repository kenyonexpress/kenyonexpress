-- 285: one-time sign-in codes sent over WhatsApp (rc5 F15).
-- Only the HMAC of a code is stored, never the code. A row lives 10 minutes,
-- allows five wrong guesses, and is consumed by the first right one.
-- Server-only: RLS on, no policies, nothing granted to anon or authenticated.
-- Rollback: drop table if exists public.auth_wa_otps;

create table if not exists public.auth_wa_otps (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null check (char_length(code_hash) = 64),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_wa_otps_phone_created_idx
  on public.auth_wa_otps (phone_e164, created_at desc);

alter table public.auth_wa_otps enable row level security;
revoke all on public.auth_wa_otps from anon, authenticated;

comment on table public.auth_wa_otps is
  'WhatsApp sign-in codes: HMAC only, 10 minutes, 5 attempts, single use. Server-only.';
