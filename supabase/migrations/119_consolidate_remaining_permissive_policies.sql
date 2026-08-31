-- 119: the last 13 multiple_permissive_policies findings.
--
-- APPLIED TO THE HOSTED PROJECT VIA MCP apply_migration ON 2026-08-19, in two
-- parts: this file is part one and 120 is the correction it needed. Both are
-- recorded here because the file chain is not the lineage production was built
-- from, so this is documentation of what ran, not a script anyone should replay
-- blindly.
--
-- Each flagged pair was NOT a duplicate. The `_public` policy carried the admin
-- and storefront branch; the `_authenticated` policy carried the
-- content_uploader / support branch. Permissive policies OR together, so
-- merging the predicates into one policy per (table, cmd) preserves the exact
-- grant and drops the second per-row evaluation.

drop policy if exists coupon_codes_select_authenticated on public.coupon_codes;
drop policy if exists coupon_codes_select_public on public.coupon_codes;
create policy coupon_codes_select_unified on public.coupon_codes
  for select to authenticated
  using (user_id = (select auth.uid()) or is_admin() or is_support());

drop policy if exists product_variants_insert_authenticated on public.product_variants;
drop policy if exists product_variants_insert_public on public.product_variants;
create policy product_variants_insert_unified on public.product_variants
  for insert to authenticated
  with check (is_admin() or has_role('content_uploader'));

drop policy if exists product_variants_update_authenticated on public.product_variants;
drop policy if exists product_variants_update_public on public.product_variants;
create policy product_variants_update_unified on public.product_variants
  for update to authenticated
  using (is_admin() or has_role('content_uploader'))
  with check (is_admin() or has_role('content_uploader'));

drop policy if exists product_variants_delete_authenticated on public.product_variants;
drop policy if exists product_variants_delete_public on public.product_variants;
create policy product_variants_delete_unified on public.product_variants
  for delete to authenticated
  using (is_admin() or has_role('content_uploader'));

drop policy if exists products_insert_authenticated on public.products;
drop policy if exists products_insert_public on public.products;
create policy products_insert_unified on public.products
  for insert to authenticated
  with check (
    is_admin()
    or has_role('content_uploader')
    or (current_user_role() = 'content_uploader'::user_role and created_by = (select auth.uid()))
  );

drop policy if exists products_update_authenticated on public.products;
drop policy if exists products_update_public on public.products;
create policy products_update_unified on public.products
  for update to authenticated
  using (
    is_admin()
    or has_role('content_uploader')
    or (current_user_role() = 'content_uploader'::user_role and created_by = (select auth.uid()))
  )
  with check (
    is_admin()
    or has_role('content_uploader')
    or (current_user_role() = 'content_uploader'::user_role and created_by = (select auth.uid()))
  );

-- Was `is_admin() OR is_admin()`, a leftover from an earlier merge: one grant,
-- two calls per row. anon can never be an admin, so this narrows to authenticated.
drop policy if exists products_delete_unified on public.products;
create policy products_delete_unified on public.products
  for delete to authenticated
  using (is_admin());

drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_unified on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or is_support());

drop policy if exists suppliers_insert_authenticated on public.suppliers;
drop policy if exists suppliers_insert_public on public.suppliers;
create policy suppliers_insert_unified on public.suppliers
  for insert to authenticated
  with check (is_admin() or has_role('content_uploader'));

drop policy if exists suppliers_update_authenticated on public.suppliers;
drop policy if exists suppliers_update_public on public.suppliers;
create policy suppliers_update_unified on public.suppliers
  for update to authenticated
  using (is_admin() or has_role('content_uploader'))
  with check (is_admin() or has_role('content_uploader'));

drop policy if exists suppliers_delete_unified on public.suppliers;
create policy suppliers_delete_unified on public.suppliers
  for delete to authenticated
  using (is_admin());
