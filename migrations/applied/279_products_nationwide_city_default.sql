-- 279: physical products with no city read "כל הארץ" (nationwide).
-- Data only, no schema change. Requested in the rc5 goal (listed there as 193,
-- a number already used in this repo). The storefront already prints the same
-- words for a NULL city, so nothing visible changes; what changes is that the
-- admin page /admin/products/missing-location can list exactly these rows for
-- the owner to replace with a real city. Coupons, services and recurring
-- products keep NULL.
-- Measured before apply (2026-10-18): 66 physical rows, all with city NULL.
-- Rollback: update public.products set city = null where city = 'כל הארץ' and type = 'physical';

update public.products
   set city = 'כל הארץ'
 where city is null
   and type = 'physical';
