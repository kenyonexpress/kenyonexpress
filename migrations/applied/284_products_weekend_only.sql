-- 284: products.weekend_only, for the "סוף שבוע" chip (rc5 F13; the goal
-- listed it as 198, a number already used in this repo).
-- NOT NULL DEFAULT false: every existing product is "not weekend-only", which
-- is what it was before the column existed, so the chip starts empty rather
-- than mislabelled. The "משלוח חינם" chip needs no column: it reads
-- shipping_price_agorot = 0 (migration 278).
-- Rollback: alter table public.products drop column if exists weekend_only;

alter table public.products
  add column if not exists weekend_only boolean not null default false;

comment on column public.products.weekend_only is
  'True when the deal is valid only on weekends (Friday and Saturday). Drives the weekend chip.';
