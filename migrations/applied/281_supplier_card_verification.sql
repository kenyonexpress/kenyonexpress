-- 281: card verification for supplier applications (rc5 F07; the goal listed it
-- as 195, a number already used in this repo).
--
-- supplier_card_verifications: one row per attempt, written BEFORE the
-- applicant leaves for the hosted card page. It carries the form payload, so
-- the supplier lead is created only after the card verifies; a failed or
-- abandoned attempt leaves this row and no lead.
-- supplier_card_tokens: the Cardcom token from a verified attempt. A token
-- is a reference the terminal issued, not card data: no PAN, no CVV.
--
-- Both are server-only: RLS on with no policies, nothing granted to anon or
-- authenticated. Only the service role reads or writes them.
-- Rollback: drop table if exists public.supplier_card_tokens; drop table if exists public.supplier_card_verifications;

create table if not exists public.supplier_card_verifications (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'started'
    check (status in ('started', 'processing', 'verified', 'failed', 'unavailable')),
  email text not null check (char_length(email) <= 254),
  payload jsonb not null,
  low_profile_code text unique,
  amount_agorot integer not null default 100 check (amount_agorot > 0),
  transaction_id text,
  voided boolean not null default false,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  supplier_lead_id uuid references public.supplier_leads (id) on delete set null,
  ip_address inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists supplier_card_verifications_created_idx
  on public.supplier_card_verifications (created_at desc);

create table if not exists public.supplier_card_tokens (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null unique
    references public.supplier_card_verifications (id) on delete cascade,
  supplier_lead_id uuid references public.supplier_leads (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  token text not null,
  card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_brand text,
  expiry_month smallint check (expiry_month is null or expiry_month between 1 and 12),
  expiry_year smallint,
  created_at timestamptz not null default now()
);

alter table public.supplier_card_verifications enable row level security;
alter table public.supplier_card_tokens enable row level security;
revoke all on public.supplier_card_verifications from anon, authenticated;
revoke all on public.supplier_card_tokens from anon, authenticated;

comment on table public.supplier_card_verifications is
  'One row per supplier card-verification attempt. The lead is created only on verified.';
comment on table public.supplier_card_tokens is
  'Cardcom token from a verified supplier card. Token only, never card data.';
