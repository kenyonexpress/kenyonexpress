-- 187: the written address of the business behind a product.
-- city, latitude and longitude are already live on products (all NULL today).
-- This adds only the free-text address that the Waze fallback link uses when
-- coordinates are missing. Nullable; a digital coupon leaves it NULL.
-- Rollback: alter table public.products drop column if exists full_address;

alter table public.products
  add column if not exists full_address text
    check (full_address is null or char_length(full_address) <= 200);

comment on column public.products.full_address is
  'Street address of the business, for the Waze q= fallback. NULL for digital coupons.';
