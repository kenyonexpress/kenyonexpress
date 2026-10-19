-- 278: per-product shipping price, integer agorot.
-- The rc5 goal listed this under 185; 185 was already written and reviewed
-- without it, so it gets its own number instead of an edit to a reviewed file.
-- NULL = no shipping line (digital coupon). 0 = free shipping, which is what
-- the free_shipping chip filters on. Never a float: money is agorot.
-- Rollback: alter table public.products drop column if exists shipping_price_agorot;

alter table public.products
  add column if not exists shipping_price_agorot integer
    check (shipping_price_agorot is null or shipping_price_agorot between 0 and 10000000);

comment on column public.products.shipping_price_agorot is
  'Shipping price in agorot. NULL = not shipped, 0 = free shipping.';
