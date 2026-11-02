-- 189_passkeys_webauthn.sql
--
-- WebAuthn passkey registration and authentication support.
-- Creates passkeys table to store user credentials for Face ID, Touch ID, and FIDO2 keys.
--
-- ROLLBACK (whole file):
--   DROP TABLE IF EXISTS passkeys;

CREATE TABLE passkeys (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter integer not null default 0,
  transports text[] default array[]::text[],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index idx_passkeys_user_id on passkeys(user_id);
create index idx_passkeys_credential_id on passkeys(credential_id);

-- Enable RLS
alter table passkeys enable row level security;

-- Users can only read/write their own passkeys
create policy "Users can read own passkeys"
  on passkeys for select
  using (auth.uid() = user_id);

create policy "Users can insert own passkeys"
  on passkeys for insert
  with check (auth.uid() = user_id);

create policy "Users can update own passkeys"
  on passkeys for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own passkeys"
  on passkeys for delete
  using (auth.uid() = user_id);
