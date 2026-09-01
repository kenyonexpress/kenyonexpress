-- Isolated sandbox schema for verifying 148. Not production. Not a pending
-- migration. No auth.users FK so the file can run on stock PostgreSQL.

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

DO $$ BEGIN
  CREATE TYPE public.audit_action AS ENUM (
    'created',
    'updated',
    'deleted',
    'restored',
    'login',
    'logout',
    'permission_change',
    'status_change',
    'manual_override'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  actor_role  text,
  action      public.audit_action NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  changes     jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid UNIQUE,
  code        text UNIQUE,
  balance_ils numeric(12,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_account   uuid NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  credit_account  uuid NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  amount_ils      numeric(12,2) NOT NULL CHECK (amount_ils > 0),
  reason          text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  order_id        uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
