-- 329_is_demo.sql (C149)
--
-- Marks demo rows (one demo deal per deal master, seeded by 330) so they can
-- be listed, filtered or removed in one statement:
--   delete from products where is_demo; delete from suppliers where is_demo;
-- Default false, so every existing row stays a real row.
-- Apply: supabase db query --linked -f migrations/pending/329_is_demo.sql

alter table public.products add column if not exists is_demo boolean not null default false;
alter table public.suppliers add column if not exists is_demo boolean not null default false;

create index if not exists products_is_demo_idx on public.products (is_demo) where is_demo;
create index if not exists suppliers_is_demo_idx on public.suppliers (is_demo) where is_demo;

comment on column public.products.is_demo is 'C149: demo deal (seeded showcase), safe to bulk-delete';
comment on column public.suppliers.is_demo is 'C149: demo business backing a demo deal, safe to bulk-delete';
