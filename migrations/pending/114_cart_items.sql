-- 114: cart_items, and the guest clause 026 forgot.
--
-- NOT APPLIED. Nothing in migrations/pending/ has been run.
--
-- READ THIS BEFORE APPLYING: THIS TABLE IS ALREADY WRITTEN, TWICE OVER
--
-- `supabase/migrations/026_commerce.sql` lines 54-85 already create
-- public.cart_items, its unique index, its updated_at trigger and two policies.
-- This file does NOT invent the table. It exists because of two measured facts:
--
--   1. The table is NOT in production. `src/types/database.ts`, which is
--      generated from the live project and is the only description of it that
--      has ever been true (see the hosted-DB lineage note in the project
--      memory), has no `cart_items`. 026 describes a database this project does
--      not have.
--
--   2. 026's policies would break the guest cart on the day they landed.
--
-- Point 2 is the reason this file is worth applying and 026 is not. Both of
-- 026's cart_items policies are `TO authenticated` and both resolve the cart
-- through `profile_id = auth.uid()`:
--
--     USING (cart_id IN (SELECT id FROM public.carts WHERE profile_id = auth.uid()))
--
-- A guest has no `auth.uid()`. `public.carts` itself has always known this: its
-- policy since 001 (line 576, restated in 045 line 47) carries a second clause,
--
--     OR session_id = current_setting('request.cookies', true)::json->>'session_id'
--
-- which is what `createGuestCartClient` (src/lib/supabase/anon.ts:72) is
-- speaking to when it sends a `Cookie: session_id=<uuid>` header. Normalising
-- the cart onto 026's cart_items as written would mean every guest line INSERT
-- is refused by RLS. The whole storefront is guest-first: that is not a
-- degraded cart, it is no cart.
--
-- So this file creates the table idempotently at 026's exact shape, and then
-- replaces the two policies with three that match how `carts` is actually
-- reached.
--
-- WHAT THIS DOES NOT DO
--
-- It does not migrate `carts.items` (jsonb) into rows, and it does not drop the
-- column. The running cart reads and writes that jsonb exclusively
-- (src/server/actions/cart.ts). Creating the table changes no behaviour on its
-- own, which is deliberate: the cutover is a code change that can be reviewed
-- and reverted, not a side effect of a DDL file. 026's own header says the same
-- thing ("carts.items jsonb keeps working until code cutover").

BEGIN;

-- ===========================================================================
-- 1. The table, at 026's shape exactly
-- ===========================================================================
-- Every statement is IF NOT EXISTS so this is a no-op on a database where 026
-- did land, and the full definition on production, where it did not.

CREATE TABLE IF NOT EXISTS public.cart_items (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    uuid        NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid        REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity   int         NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The platform percent as it stood when the line was added, in whole percent.
-- Not in 026: snapshots postdate it. The jsonb cart already carries this per
-- line (`platform_percent_snapshot`, src/lib/cart/types.ts:21) and the
-- normalised table has to be able to hold it or the cutover silently drops it.
--
-- Nullable on purpose. NULL means "the admin had not set a percent when this
-- line was added", which `pricing.ts` treats as unpriceable. That is not the
-- same fact as 0, and a DEFAULT 0 here would be a fixed commission rate
-- entering through the schema, which AGENTS.md forbids outright.
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS platform_percent_snapshot numeric(5,2)
    CHECK (platform_percent_snapshot IS NULL
           OR platform_percent_snapshot BETWEEN 0 AND 100);

-- UNIQUE with nullable variant_id needs a coalescing expression index.
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_product_variant_key
  ON public.cart_items (cart_id, product_id,
                        COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS cart_items_cart_id_idx ON public.cart_items (cart_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.cart_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 2. Policies that a guest can actually satisfy
-- ===========================================================================
-- 026's two are dropped by name rather than left alongside. Postgres ORs
-- permissive policies together, so leaving the old owner policy in place would
-- be harmless for access but would leave two statements of the same rule, and
-- the next reader would have to work out which one is load-bearing.

DROP POLICY IF EXISTS "cart_items: owner all" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items: admin all" ON public.cart_items;

-- The signed-in shopper. Unchanged from 026 in meaning.
DROP POLICY IF EXISTS "cart_items: account owner all" ON public.cart_items;
CREATE POLICY "cart_items: account owner all"
  ON public.cart_items FOR ALL TO authenticated
  USING (cart_id IN (SELECT id FROM public.carts WHERE profile_id = auth.uid()))
  WITH CHECK (cart_id IN (SELECT id FROM public.carts WHERE profile_id = auth.uid()));

-- The guest. Mirrors the `carts` policy clause exactly, including `profile_id
-- IS NULL`: without that a leaked session_id cookie would reach a cart that has
-- since been claimed by an account at login. `mergeGuestCart` deletes the guest
-- row when it merges, so a row that still has a NULL profile_id is one no
-- account has taken over.
DROP POLICY IF EXISTS "cart_items: guest session all" ON public.cart_items;
CREATE POLICY "cart_items: guest session all"
  ON public.cart_items FOR ALL TO anon
  USING (
    cart_id IN (
      SELECT id FROM public.carts
      WHERE profile_id IS NULL
        AND session_id = current_setting('request.cookies', true)::json->>'session_id'
    )
  )
  WITH CHECK (
    cart_id IN (
      SELECT id FROM public.carts
      WHERE profile_id IS NULL
        AND session_id = current_setting('request.cookies', true)::json->>'session_id'
    )
  );

DROP POLICY IF EXISTS "cart_items: admin all" ON public.cart_items;
CREATE POLICY "cart_items: admin all"
  ON public.cart_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.cart_items IS
  'Normalised cart lines. Not yet read by the application: src/server/actions/cart.ts still uses carts.items (jsonb). Created by 114 so the cutover is a reviewable code change rather than a DDL side effect.';

COMMENT ON COLUMN public.cart_items.platform_percent_snapshot IS
  'products.platform_percent as it stood when the line was added, whole percent. NULL means the admin had not set one, which prices the line as unavailable. Never defaulted: a default here would be a fixed commission rate, which AGENTS.md forbids.';

COMMIT;
