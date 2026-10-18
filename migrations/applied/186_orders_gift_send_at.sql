-- 186: scheduled gift delivery.
-- One nullable column on orders. NULL = send immediately, the behaviour today.
-- The checkout writes it in its own statement and finalize reads it in its own
-- select, so the application is correct before and after this is applied.
-- Rollback: alter table public.orders drop column if exists gift_send_at;

alter table public.orders
  add column if not exists gift_send_at timestamptz;

comment on column public.orders.gift_send_at is
  'When the gift email for this order should go out. NULL = immediately.';
