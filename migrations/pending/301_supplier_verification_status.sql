-- Migration 301: suppliers.verification_status (re-home of supabase/migrations/297_supplier_verification_status.sql, never applied)
-- Idempotent. Apply via Supabase MCP apply_migration on ixvwfbuvfxxsjiywhbbb.

-- Create enum if not exists
do $$ begin
  create type supplier_verification_status as enum ('unverified', 'pending', 'verified');
exception when duplicate_object then null;
end $$;

-- Add column if not exists
alter table public.suppliers
  add column if not exists verification_status supplier_verification_status not null default 'unverified';

-- Add tracking columns
alter table public.suppliers
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid;

-- Add comment
comment on column public.suppliers.verification_status is 'Supplier identity verification status: unverified, pending, or verified';
comment on column public.suppliers.verified_at is 'Timestamp when supplier was verified';
comment on column public.suppliers.verified_by is 'Admin user ID who verified this supplier';
