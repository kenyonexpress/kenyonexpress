-- 320: C104 F13. products.opening_hours jsonb drives the "open on weekend" chip.
-- Shape: {"sun":{"open":true,"from":"09:00","to":"17:00"}, ..., "fri":{...}, "sat":{...}}
-- keys sun..sat; a day is open when its "open" is the JSON boolean true. A missing
-- day or a NULL column means unknown, which the chip treats as not open.
-- The chip matches a product when fri OR sat is open (src/lib/opening-hours.ts).
-- No money column. "Free shipping" needs no column: it reads
-- physical_products/products.shipping_price_agorot = 0 (migration 278).
-- Rollback: drop index if exists public.products_opens_weekend_idx;
--           alter table public.products drop column if exists opening_hours;

alter table public.products
  add column if not exists opening_hours jsonb;

comment on column public.products.opening_hours is
  'Per-day opening hours keyed sun..sat, each {"open": bool, "from": "HH:MM", "to": "HH:MM"}. Drives the open-on-weekend chip (fri or sat open).';

create index if not exists products_opens_weekend_idx
  on public.products (((opening_hours -> 'fri' ->> 'open') = 'true' or (opening_hours -> 'sat' ->> 'open') = 'true'))
  where deleted_at is null;
