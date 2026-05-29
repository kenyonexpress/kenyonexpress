-- Migration 016: Add kenyon_price, full_price, is_coupon_enabled to products
-- kenyon_price  = actual selling price on KenyonExpress (replaces base_price in the admin form)
-- full_price    = original list price shown with strikethrough on the storefront
-- is_coupon_enabled = when true, the customer may pay 10% online + 90% at the physical store
-- Idempotent: safe to run multiple times.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS kenyon_price      numeric(10,2),
  ADD COLUMN IF NOT EXISTS full_price        numeric(10,2),
  ADD COLUMN IF NOT EXISTS is_coupon_enabled boolean NOT NULL DEFAULT false;
