-- 189_passkeys_webauthn.sql (idempotent)
--
-- WebAuthn passkey registration and authentication support.
-- Creates webauthn_credentials table to store user credentials for Face ID, Touch ID, and FIDO2 keys.
--
-- IDEMPOTENT: Uses IF NOT EXISTS to allow re-running without errors.
--
-- ROLLBACK (whole file):
--   DROP TABLE IF EXISTS webauthn_credentials;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  public_key text not null,
  counter integer not null default 0,
  transports text[] default array[]::text[],
  device_type text,
  backed_up boolean default false,
  aaguid text,
  friendly_name text,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_webauthn_credentials_user_id on webauthn_credentials(user_id);
create index if not exists idx_webauthn_credentials_id on webauthn_credentials(id);

-- Enable RLS
alter table webauthn_credentials enable row level security;

-- Users can only read/write their own passkeys
create policy "Users can read own webauthn_credentials"
  on webauthn_credentials for select
  using (auth.uid() = user_id);

create policy "Users can insert own webauthn_credentials"
  on webauthn_credentials for insert
  with check (auth.uid() = user_id);

create policy "Users can update own webauthn_credentials"
  on webauthn_credentials for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own webauthn_credentials"
  on webauthn_credentials for delete
  using (auth.uid() = user_id);
