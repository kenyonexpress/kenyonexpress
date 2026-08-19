-- 120: the correction 119 needed on the four tables anon must still read.
--
-- MEASURED, NOT ASSUMED. 119 first merged these four SELECT pairs into a single
-- `to public` policy the same way as the rest. A `set local role anon` probe
-- against the result failed immediately:
--
--   ERROR: 42501: permission denied for function current_user_role
--   CONTEXT: SQL statement "select count(*) from public.products"
--
-- `anon` holds no EXECUTE on `current_user_role()` or `has_role(text)` -- they
-- appear only under the authenticated-executable advisor, never the anon one.
-- A single `to public` policy whose predicate mentions either function
-- therefore fails the WHOLE read for a logged-out visitor: the storefront
-- catalogue, not an edge case. Under RLS a predicate error is not a filtered
-- row, it aborts the statement.
--
-- So these four split by role instead of merging: one policy for anon whose
-- predicate uses only anon-executable functions, one for authenticated with the
-- admin / uploader / supplier branches. That is still ONE permissive policy per
-- role per action, which is what the advisor counts -- and the advisor confirms
-- it: performance WARN went 13 -> 0.
--
-- THE RULE THIS LEAVES BEHIND: never fold an authenticated-only predicate into
-- a `to public` policy. Check EXECUTE on every function named in the predicate
-- against every role the policy applies to, first.

drop policy if exists categories_select_unified on public.categories;
drop policy if exists categories_select_authenticated on public.categories;
drop policy if exists categories_select_public on public.categories;
create policy categories_select_anon on public.categories
  for select to anon
  using (is_active = true);
create policy categories_select_authenticated on public.categories
  for select to authenticated
  using (
    is_active = true
    or is_admin()
    or (current_user_role() = 'content_uploader'::user_role and created_by = (select auth.uid()))
  );

drop policy if exists products_select_unified on public.products;
drop policy if exists products_select_authenticated on public.products;
drop policy if exists products_select_public on public.products;
create policy products_select_anon on public.products
  for select to anon
  using (status = 'active'::product_status and deleted_at is null);
create policy products_select_authenticated on public.products
  for select to authenticated
  using (
    (status = 'active'::product_status and deleted_at is null)
    or is_admin()
    or (current_user_role() = 'content_uploader'::user_role and created_by = (select auth.uid()))
    or (supplier_id is not null and is_supplier_member(supplier_id))
  );

drop policy if exists product_variants_select_unified on public.product_variants;
drop policy if exists product_variants_select_authenticated on public.product_variants;
drop policy if exists product_variants_select_public on public.product_variants;
create policy product_variants_select_anon on public.product_variants
  for select to anon
  using (
    (is_active = true and deleted_at is null)
    or product_id in (select products.id from public.products where products.status = 'active'::product_status)
  );
create policy product_variants_select_authenticated on public.product_variants
  for select to authenticated
  using (
    (is_active = true and deleted_at is null)
    or product_id in (select products.id from public.products where products.status = 'active'::product_status)
    or is_admin()
    or has_role('content_uploader')
  );

drop policy if exists popular_searches_select_unified on public.popular_searches;
drop policy if exists popular_searches_select_anon_authenticated on public.popular_searches;
drop policy if exists popular_searches_select_authenticated on public.popular_searches;
create policy popular_searches_select_anon on public.popular_searches
  for select to anon
  using (is_active);
create policy popular_searches_select_authenticated on public.popular_searches
  for select to authenticated
  using (is_active or has_role('admin'));
