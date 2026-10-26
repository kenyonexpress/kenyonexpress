-- 294: Group deals / bulk purchase discounts (C47 Item 1)
-- Implements tiered discounts for group purchases.
-- Users can create or join group deals to unlock volume-based pricing.

-- Group deals table
create table if not exists public.group_deals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete cascade,

  -- Discount tiers stored as JSONB array
  -- Example: [{"minQuantity": 5, "discountPercent": 10}, {"minQuantity": 10, "discountPercent": 20}]
  tiers jsonb not null check (jsonb_typeof(tiers) = 'array'),

  current_participants integer not null default 1 check (current_participants >= 0),
  max_participants integer not null check (max_participants > 0 and max_participants <= 1000),

  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'expired')),

  expires_at timestamptz not null check (expires_at > created_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (current_participants <= max_participants)
);

-- Group deal participants
create table if not exists public.group_deal_participants (
  id uuid primary key default gen_random_uuid(),
  group_deal_id uuid not null references public.group_deals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  joined_at timestamptz not null default now(),

  -- Prevent duplicate participation
  unique(group_deal_id, user_id)
);

-- Indexes
create index if not exists group_deals_product_id_idx on public.group_deals(product_id);
create index if not exists group_deals_organizer_id_idx on public.group_deals(organizer_id);
create index if not exists group_deals_status_idx on public.group_deals(status);
create index if not exists group_deals_expires_at_idx on public.group_deals(expires_at);

create index if not exists group_deal_participants_group_deal_id_idx
  on public.group_deal_participants(group_deal_id);
create index if not exists group_deal_participants_user_id_idx
  on public.group_deal_participants(user_id);

-- RLS policies
alter table public.group_deals enable row level security;
alter table public.group_deal_participants enable row level security;

-- Everyone can view active group deals
create policy "group_deals_select_active" on public.group_deals
  for select using (status = 'active' and expires_at > now());

-- Authenticated users can create group deals
create policy "group_deals_insert_auth" on public.group_deals
  for insert to authenticated with check (auth.uid() = organizer_id);

-- Organizers can update their own deals
create policy "group_deals_update_own" on public.group_deals
  for update to authenticated
  using (auth.uid() = organizer_id)
  with check (auth.uid() = organizer_id);

-- Participants can view participants of deals they're in
create policy "group_deal_participants_select" on public.group_deal_participants
  for select using (
    user_id = auth.uid() or
    exists (
      select 1 from public.group_deal_participants gdp2
      where gdp2.group_deal_id = group_deal_participants.group_deal_id
      and gdp2.user_id = auth.uid()
    )
  );

-- Authenticated users can join group deals
create policy "group_deal_participants_insert" on public.group_deal_participants
  for insert to authenticated with check (auth.uid() = user_id);

-- Users can leave group deals (delete their participation)
create policy "group_deal_participants_delete_own" on public.group_deal_participants
  for delete to authenticated using (auth.uid() = user_id);

-- Updated_at trigger
create trigger set_updated_at before update on public.group_deals
  for each row execute function public.set_updated_at();

comment on table public.group_deals is
  'Group purchase deals with tiered discounts. C47 Item 1.';
comment on table public.group_deal_participants is
  'Users participating in group deals to unlock volume discounts.';
