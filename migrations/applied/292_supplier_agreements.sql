-- 292: supplier_agreements table for click-wrap terms acceptance tracking (C29).
--
-- Records each supplier's acceptance of terms, separate from card verification.
-- Stores version hash, timestamp, IP, and user agent for audit trail.
-- A supplier may have multiple agreements over time as terms are updated.
--
-- RLS: service-role only, no public access. Only server actions write here.
-- Rollback: drop table if exists public.supplier_agreements;

create table if not exists public.supplier_agreements (
  id uuid primary key default gen_random_uuid(),

  -- Links to supplier or verification
  supplier_lead_id uuid references public.supplier_leads (id) on delete set null,
  verification_id uuid references public.supplier_card_verifications (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,

  -- Agreement details
  version_hash text not null check (char_length(version_hash) = 64),
  version_date text not null check (version_date ~ '^\d{4}-\d{2}-\d{2}$'),

  -- Tracking info
  ip_address inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),

  created_at timestamptz not null default now()
);

create index if not exists supplier_agreements_supplier_lead_id_idx
  on public.supplier_agreements (supplier_lead_id);

create index if not exists supplier_agreements_verification_id_idx
  on public.supplier_agreements (verification_id);

create index if not exists supplier_agreements_supplier_id_idx
  on public.supplier_agreements (supplier_id);

create index if not exists supplier_agreements_created_idx
  on public.supplier_agreements (created_at desc);

alter table public.supplier_agreements enable row level security;
revoke all on public.supplier_agreements from anon, authenticated;

comment on table public.supplier_agreements is
  'Click-wrap terms acceptance records for suppliers. Each row is one acceptance event.';
comment on column public.supplier_agreements.version_hash is
  'SHA-256 hash of the agreement text that was displayed and accepted.';
comment on column public.supplier_agreements.version_date is
  'The version date from SUPPLIER_AGREEMENT_VERSION at time of acceptance.';
