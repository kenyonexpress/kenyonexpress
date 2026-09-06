-- 149: soft delete on the four user-facing tables that still lack it.
--
-- MEASURED on production 2026-09-04 (pg_policies + information_schema):
--
--   already soft-deletable, RLS filtered : products, product_variants,
--                                          suppliers, user_addresses,
--                                          vendors, coupon_deals
--   missing deleted_at entirely          : categories, product_images,
--                                          reviews, wishlists
--
-- This file closes the gap. For each of the four it adds `deleted_at
-- timestamptz`, the house partial index (`<table>_deleted_at_idx ... where
-- deleted_at is null`, same shape as products/vendors/coupon_deals), and
-- rewrites the client-facing SELECT policies so a soft-deleted row is
-- invisible to shoppers while admin keeps seeing it for restore.
--
-- Also closed, deliberately: product_images_select_unified let anyone read
-- images of a soft-deleted product, because it only checked
-- products.status = 'active' and a soft delete does not change status. The
-- recreated policy checks the parent's deleted_at too.
--
-- What each policy branch does after this file:
--
--   categories       anon sees is_active and not deleted; authenticated adds
--                    is_admin() and the content_uploader own-rows branch
--                    (uploader branch left unfiltered, matching products).
--   product_images   visible when not deleted AND the parent product is
--                    active and not deleted; admin sees everything.
--   reviews          public sees approved and not deleted; the owner branch
--                    hides the owner's own deleted reviews as well.
--   wishlists        the single owner-ALL policy becomes four per-command
--                    policies. SELECT filters deleted_at; UPDATE does not,
--                    so an un-delete (set deleted_at = null) stays possible.
--
-- Not touched, and why:
--
--   orders, order_items, payments, wallet_*, settlement_events, refunds,
--   invoices  : financial records. Nothing here may disappear from a query.
--   audit_log, *_redemptions, payment_events : append-only by design.
--   banners, homepage_sections, supplier_branches : admin CMS rows whose
--   lifecycle is is_active; "delete" there is deactivation, already filtered.
--
-- Service-role readers bypass RLS, so the application filter lives in
-- src/lib/soft-delete.ts and is applied at every service-role call site in
-- the same change set as this file.
--
-- ROLLBACK
--
--   drop policy if exists wishlists_owner_select on public.wishlists;
--   drop policy if exists wishlists_owner_insert on public.wishlists;
--   drop policy if exists wishlists_owner_update on public.wishlists;
--   drop policy if exists wishlists_owner_delete on public.wishlists;
--   create policy wishlists_owner_all on public.wishlists for all
--     using (user_id = (select auth.uid()))
--     with check (user_id = (select auth.uid()));
--   -- then for each table: recreate the pre-149 select policies (texts are
--   -- quoted verbatim below in each section) and
--   alter table public.categories     drop column if exists deleted_at;
--   alter table public.product_images drop column if exists deleted_at;
--   alter table public.reviews        drop column if exists deleted_at;
--   alter table public.wishlists      drop column if exists deleted_at;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

-- ---------------------------------------------------------------------------
-- categories
-- pre-149 policies:
--   categories_select_anon          using (is_active = true)
--   categories_select_authenticated using ((is_active = true) or is_admin()
--     or ((current_user_role() = 'content_uploader'::user_role)
--         and (created_by = (select auth.uid()))))
-- ---------------------------------------------------------------------------

alter table public.categories add column if not exists deleted_at timestamptz;

create index if not exists categories_deleted_at_idx
  on public.categories (deleted_at) where (deleted_at is null);

drop policy if exists categories_select_anon on public.categories;
create policy categories_select_anon on public.categories
  for select to anon
  using (is_active = true and deleted_at is null);

drop policy if exists categories_select_authenticated on public.categories;
create policy categories_select_authenticated on public.categories
  for select to authenticated
  using (
    (is_active = true and deleted_at is null)
    or is_admin()
    or (
      current_user_role() = 'content_uploader'::public.user_role
      and created_by = (select auth.uid())
    )
  );

comment on column public.categories.deleted_at is
  'Soft delete (149). Null = live. Set instead of DELETE so product rows keep their category and admin can restore.';

-- ---------------------------------------------------------------------------
-- product_images
-- pre-149 policy:
--   product_images_select_unified using (is_admin() or (product_id in
--     (select products.id from products
--       where products.status = 'active'::product_status)))
-- ---------------------------------------------------------------------------

alter table public.product_images add column if not exists deleted_at timestamptz;

create index if not exists product_images_deleted_at_idx
  on public.product_images (deleted_at) where (deleted_at is null);

drop policy if exists product_images_select_unified on public.product_images;
create policy product_images_select_unified on public.product_images
  for select
  using (
    is_admin()
    or (
      deleted_at is null
      and product_id in (
        select p.id from public.products p
        where p.status = 'active'::public.product_status
          and p.deleted_at is null
      )
    )
  );

comment on column public.product_images.deleted_at is
  'Soft delete (149). Null = live. The select policy also requires the parent product to be live.';

-- ---------------------------------------------------------------------------
-- reviews
-- pre-149 policies:
--   reviews_public_read_approved using (status = 'approved'::text)
--   reviews_owner_read           using (user_id = (select auth.uid()))
-- ---------------------------------------------------------------------------

alter table public.reviews add column if not exists deleted_at timestamptz;

create index if not exists reviews_deleted_at_idx
  on public.reviews (deleted_at) where (deleted_at is null);

drop policy if exists reviews_public_read_approved on public.reviews;
create policy reviews_public_read_approved on public.reviews
  for select
  using (status = 'approved'::text and deleted_at is null);

drop policy if exists reviews_owner_read on public.reviews;
create policy reviews_owner_read on public.reviews
  for select
  using (user_id = (select auth.uid()) and deleted_at is null);

comment on column public.reviews.deleted_at is
  'Soft delete (149). Null = live. A deleted review vanishes for everyone including its author; moderation keeps the row.';

-- ---------------------------------------------------------------------------
-- wishlists
-- pre-149 policy:
--   wishlists_owner_all for all
--     using (user_id = (select auth.uid()))
--     with check (user_id = (select auth.uid()))
-- ---------------------------------------------------------------------------

alter table public.wishlists add column if not exists deleted_at timestamptz;

create index if not exists wishlists_deleted_at_idx
  on public.wishlists (deleted_at) where (deleted_at is null);

drop policy if exists wishlists_owner_all on public.wishlists;

drop policy if exists wishlists_owner_select on public.wishlists;
create policy wishlists_owner_select on public.wishlists
  for select
  using (user_id = (select auth.uid()) and deleted_at is null);

drop policy if exists wishlists_owner_insert on public.wishlists;
create policy wishlists_owner_insert on public.wishlists
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists wishlists_owner_update on public.wishlists;
create policy wishlists_owner_update on public.wishlists
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists wishlists_owner_delete on public.wishlists;
create policy wishlists_owner_delete on public.wishlists
  for delete
  using (user_id = (select auth.uid()));

comment on column public.wishlists.deleted_at is
  'Soft delete (149). Null = live. UPDATE is deliberately unfiltered so the owner can restore (set deleted_at back to null).';
