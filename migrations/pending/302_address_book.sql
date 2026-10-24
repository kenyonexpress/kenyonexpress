-- 302: user address book (C66)
-- Stores saved addresses for users, one marked as default.
-- Rollback: drop table if exists public.address_book;

create table if not exists public.address_book (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (length(label) >= 1 and length(label) <= 50),
  full_name text not null check (length(full_name) >= 1 and length(full_name) <= 100),
  phone text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  street text not null check (length(street) >= 1 and length(street) <= 200),
  city text not null check (length(city) >= 1 and length(city) <= 100),
  postal_code text check (postal_code is null or length(postal_code) <= 20),
  country text not null default 'IL' check (length(country) = 2),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.address_book is 'User saved addresses for checkout autofill';
comment on column public.address_book.label is 'User-defined label like "Home", "Work", "Parents"';
comment on column public.address_book.is_default is 'Only one address per user can be default';

-- Ensure user can have only one default address
create unique index if not exists address_book_user_default_idx
  on public.address_book (user_id)
  where is_default = true;

-- Performance index for user queries
create index if not exists address_book_user_id_idx
  on public.address_book (user_id, created_at desc);

-- Enable RLS
alter table public.address_book enable row level security;

-- Users can view their own addresses
drop policy if exists address_book_select_own on public.address_book;
create policy address_book_select_own on public.address_book
  for select using (user_id = (select auth.uid()));

-- Users can insert their own addresses
drop policy if exists address_book_insert_own on public.address_book;
create policy address_book_insert_own on public.address_book
  for insert with check (user_id = (select auth.uid()));

-- Users can update their own addresses
drop policy if exists address_book_update_own on public.address_book;
create policy address_book_update_own on public.address_book
  for update using (user_id = (select auth.uid()));

-- Users can delete their own addresses
drop policy if exists address_book_delete_own on public.address_book;
create policy address_book_delete_own on public.address_book
  for delete using (user_id = (select auth.uid()));

-- Function to ensure only one default address per user
create or replace function public.ensure_one_default_address()
returns trigger as $$
begin
  if NEW.is_default = true then
    -- Unset all other addresses for this user
    update public.address_book
    set is_default = false
    where user_id = NEW.user_id
      and id != NEW.id
      and is_default = true;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger to maintain single default constraint
drop trigger if exists ensure_one_default_address_trigger on public.address_book;
create trigger ensure_one_default_address_trigger
  before insert or update on public.address_book
  for each row
  execute function public.ensure_one_default_address();
