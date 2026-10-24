-- 296: Tzimmer bookings (C47 Item 7)
-- Implements booking calendar for vacation rental (tzimmer) products.
-- Phase 2 feature, gated by tzimmer-calendar flag (migration 293).

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,

  check_in date not null,
  check_out date not null check (check_out > check_in),

  guests integer not null check (guests > 0 and guests <= 20),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),

  price_agorot integer not null check (price_agorot > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,

  -- Prevent overlapping bookings for the same product
  exclude using gist (
    product_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('confirmed', 'pending'))
);

-- Product availability calendar
create table if not exists public.booking_availability (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,

  date date not null,
  is_available boolean not null default true,
  max_guests integer check (max_guests > 0 and max_guests <= 20),
  price_agorot integer check (price_agorot > 0),

  -- One availability entry per product per date
  unique(product_id, date)
);

-- Indexes
create index if not exists bookings_user_id_idx on public.bookings(user_id);
create index if not exists bookings_product_id_idx on public.bookings(product_id);
create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists bookings_check_in_idx on public.bookings(check_in);
create index if not exists bookings_check_out_idx on public.bookings(check_out);

create index if not exists booking_availability_product_id_idx
  on public.booking_availability(product_id);
create index if not exists booking_availability_date_idx
  on public.booking_availability(date);

-- RLS policies
alter table public.bookings enable row level security;
alter table public.booking_availability enable row level security;

-- Users can view their own bookings
create policy "bookings_select_own" on public.bookings
  for select to authenticated using (auth.uid() = user_id);

-- Product owners can view bookings for their products
create policy "bookings_select_supplier" on public.bookings
  for select to authenticated using (
    exists (
      select 1 from public.products p
      where p.id = bookings.product_id
      and p.supplier_id in (
        select id from public.suppliers where user_id = auth.uid()
      )
    )
  );

-- Users can create bookings
create policy "bookings_insert_own" on public.bookings
  for insert to authenticated with check (auth.uid() = user_id);

-- Users can cancel their own bookings
create policy "bookings_update_own" on public.bookings
  for update to authenticated
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);

-- Product owners can confirm bookings
create policy "bookings_update_supplier" on public.bookings
  for update to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = bookings.product_id
      and p.supplier_id in (
        select id from public.suppliers where user_id = auth.uid()
      )
    )
  );

-- Everyone can view availability (to check before booking)
create policy "booking_availability_select_all" on public.booking_availability
  for select using (true);

-- Suppliers can manage availability for their products
create policy "booking_availability_all_supplier" on public.booking_availability
  for all to authenticated using (
    exists (
      select 1 from public.products p
      where p.id = booking_availability.product_id
      and p.supplier_id in (
        select id from public.suppliers where user_id = auth.uid()
      )
    )
  );

-- Updated_at trigger
create trigger set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

comment on table public.bookings is
  'Tzimmer (vacation rental) bookings. Phase 2, tzimmer-calendar flag. C47 Item 7.';
comment on table public.booking_availability is
  'Availability calendar for bookable products.';
