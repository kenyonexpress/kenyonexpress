-- 154: verified purchase reviews, and the wishlist the masthead heart points at.
--
-- TWO TABLES, ONE RULE EACH.
--
-- reviews: only a buyer reviews, and only once per purchased line. The
-- verification is not a code path -- it is the INSERT policy itself, so there
-- is no route, action, or script that can create an unverified review, ours or
-- anyone's. `order_item_id UNIQUE` is the once-per-purchase barrier: buying
-- twice earns two review slots, spamming one purchase earns one.
--
-- Moderation is a status column, not a delete: `pending` on insert, an admin
-- moves it to `approved`/`rejected`, and only `approved` is publicly readable.
-- The moderation write path is the service role (admin pages run on
-- createAdminClient), so no UPDATE policy exists for users at all -- a buyer
-- cannot edit a review after approval, they can only delete their own row.
--
-- wishlists: owner-only in every direction, a plain (user_id, product_id)
-- pair. Public read is deliberately absent -- a wishlist is browsing history.
--
-- WHY user_id IS profiles(id): auth.users -> profiles shares the uuid
-- (CASCADE FK), and every neighbouring table (orders.user_id,
-- referrals.user_id in 098) points at profiles. auth.uid() compares equal.
--
-- "paid or later" MEANS: orders.status IN (paid, partially_fulfilled,
-- fulfilled, platform_settled) -- the deployed order_status enum. `refunded`
-- and `cancelled` buyers lose the slot on purpose: a refunded purchase is not
-- a verified purchase.
--
-- ROLLBACK
--
--   drop table if exists public.reviews;
--   drop table if exists public.wishlists;
--
-- DRY RUN, 2026-09-02, against production in a transaction rolled back by a
-- RAISE at the end (MIGRATION154_DRYRUN): verified insert as the real buyer of
-- a real paid order_item PASSED the policy; a second review on the same line
-- refused (unique_violation); a random order_item refused; another user
-- claiming the same purchase refused; the pending row invisible to anon.
-- ok=t problems=[none].
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.

CREATE TABLE IF NOT EXISTS public.reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The purchased line this review is earned by. RESTRICT, not CASCADE:
  -- order_items are 7-year bookkeeping and do not vanish; if one ever did,
  -- losing the review silently would hide why the constraint existed.
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,

  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  -- 2000 is a hard DB ceiling; the zod schema holds the product limit (1000)
  -- so tightening UX copy never needs a migration.
  body          text CHECK (body IS NULL OR char_length(body) <= 2000),

  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS reviews_product_approved_idx
  ON public.reviews (product_id, created_at DESC) WHERE status = 'approved';

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_public_read_approved ON public.reviews;
CREATE POLICY reviews_public_read_approved ON public.reviews
  FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS reviews_owner_read ON public.reviews;
CREATE POLICY reviews_owner_read ON public.reviews
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- THE VERIFICATION. The row is insertable only when the named order_item
-- belongs to an order of the inserting user, sells the named product, and that
-- order is paid or later. Everything else 42501s at the table, whatever code
-- tried it.
DROP POLICY IF EXISTS reviews_owner_insert_verified ON public.reviews;
CREATE POLICY reviews_owner_insert_verified ON public.reviews
  FOR INSERT WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.id = reviews.order_item_id
         AND oi.product_id = reviews.product_id
         AND o.user_id = (SELECT auth.uid())
         AND o.status IN ('paid', 'partially_fulfilled', 'fulfilled', 'platform_settled')
    )
  );

DROP POLICY IF EXISTS reviews_owner_delete ON public.reviews;
CREATE POLICY reviews_owner_delete ON public.reviews
  FOR DELETE USING (user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.wishlists (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wishlists_owner_all ON public.wishlists;
CREATE POLICY wishlists_owner_all ON public.wishlists
  FOR ALL USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
