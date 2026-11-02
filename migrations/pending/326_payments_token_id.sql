-- 326_payments_token_id.sql
--
-- The saved-card charge (chargeSavedToken in src/server/actions/payments/
-- checkout.ts) inserts payments.token_id, the FK to the card it rode on.
-- supabase/migrations/026 described the column; production never received it.
-- Measured 2026-11-02 (C142): every saved-card checkout fails with
-- "Could not find the 'token_id' column of 'payments' in the schema cache".
-- Additive, nullable, no data change. Run preflight_326.sql first.

alter table public.payments
  add column if not exists token_id uuid references public.payment_tokens (id) on delete set null;

create index if not exists payments_token_id_idx on public.payments (token_id) where token_id is not null;

comment on column public.payments.token_id is
  'Saved card (payment_tokens.id) a server-to-server token charge used; null for hosted-page charges.';
