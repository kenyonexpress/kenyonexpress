-- 104_products_public_read_respects_soft_delete.sql
--
-- Goal 11. `public.products` carries two overlapping public SELECT policies:
--
--   products: public read   USING (status = 'active' AND deleted_at IS NULL)
--   products_public_read    USING (status = 'active')
--
-- RLS policies for the same command are OR'd, so the weaker one decides. The
-- `deleted_at IS NULL` half of the first policy has never had any effect, and a
-- soft-deleted product stays readable over the public REST endpoint and to any
-- anon query. Soft delete is, today, not a delete.
--
-- Measured against production on 2026-08-03 before writing this: 61 active
-- products, 0 with `deleted_at` set. So nothing is leaking right now -- this is
-- latent, and it fires the first time anyone soft-deletes a product, which is
-- exactly when someone will believe it is gone.
--
-- The fix is to drop the redundant weaker policy rather than to patch it. Two
-- policies expressing one rule is how the rules drifted apart in the first
-- place, and `products: public read` already states the intended rule
-- correctly and in full.
--
-- Idempotent: DROP POLICY IF EXISTS, and the CREATE is guarded the same way.

begin;

-- The weaker duplicate. Its entire contribution was to OR away the soft-delete
-- check that its twin performs.
drop policy if exists "products_public_read" on public.products;

-- Restate the surviving policy unconditionally, so this migration also repairs
-- a database where the wrong one of the pair was the survivor.
drop policy if exists "products: public read" on public.products;
create policy "products: public read"
  on public.products
  for select
  using (status = 'active'::public.product_status and deleted_at is null);

commit;
