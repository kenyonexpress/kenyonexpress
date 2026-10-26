-- 295: Course subscriptions (C47 Item 6)
-- Implements monthly/quarterly/annual recurring billing for course products.
-- Phase 2 feature, gated by courses-monthly flag (migration 293).

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,

  interval text not null check (interval in ('monthly', 'quarterly', 'annual')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'paused', 'expired', 'pending_payment')),

  current_period_start timestamptz not null,
  current_period_end timestamptz not null check (current_period_end > current_period_start),

  price_agorot integer not null check (price_agorot > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,

  -- User can only have one active subscription per product
  unique(user_id, product_id, status) where (status = 'active')
);

-- Subscription billing history
create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,

  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),

  amount_agorot integer not null check (amount_agorot > 0),
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded')),

  paid_at timestamptz,
  created_at timestamptz not null default now(),

  -- One invoice per subscription per period
  unique(subscription_id, period_start)
);

-- Indexes
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_product_id_idx on public.subscriptions(product_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);
create index if not exists subscriptions_current_period_end_idx on public.subscriptions(current_period_end);

create index if not exists subscription_invoices_subscription_id_idx
  on public.subscription_invoices(subscription_id);
create index if not exists subscription_invoices_status_idx
  on public.subscription_invoices(status);

-- RLS policies
alter table public.subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;

-- Users can view their own subscriptions
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);

-- Users can create their own subscriptions
create policy "subscriptions_insert_own" on public.subscriptions
  for insert to authenticated with check (auth.uid() = user_id);

-- Users can update their own subscriptions (cancel, pause)
create policy "subscriptions_update_own" on public.subscriptions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can view their own invoices
create policy "subscription_invoices_select_own" on public.subscription_invoices
  for select to authenticated using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_invoices.subscription_id
      and s.user_id = auth.uid()
    )
  );

-- System can create invoices (via service role)
-- No insert policy for authenticated - invoices created by billing cron

-- Updated_at trigger
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

comment on table public.subscriptions is
  'Recurring subscriptions for course products. Phase 2, courses-monthly flag. C47 Item 6.';
comment on table public.subscription_invoices is
  'Billing history for subscriptions.';
