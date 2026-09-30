-- 248_wishlist_shares.sql
--
-- A shareable link for a wishlist (STEP 12, 01.10).
--
-- MEASURED BEFORE WRITING. `grep -rn "wishlist_share\|shared wishlist"
-- src migrations supabase` found nothing on 2026-10-01. 154 made `wishlists`
-- owner-only in every direction and said why: a wishlist is browsing history
-- and public read is deliberately absent. That stays true. This file does not
-- add a policy to `wishlists`; it adds ONE capability the owner can mint,
-- show to a friend, and take back.
--
-- WHAT THIS IS. One row per user: an unguessable token, an on/off flag, and
-- the times. The token IS the authorisation: whoever presents it reads the
-- owner's saved products (name, slug, price, image, stock), and nothing
-- else -- not the owner's name, not when each was saved, not the owner's id.
-- The read is a SECURITY DEFINER function keyed by the token, granted to
-- anon and authenticated, because that is the only way a signed-out friend
-- can see a list that RLS otherwise hides. The definer fn takes NOTHING from
-- the caller's identity (the 2026-09 lesson on definer functions that read
-- auth.uid() or a caller-supplied uid): the token is the whole input, and a
-- wrong or disabled token returns zero rows, never an error that says which.
--
-- WHY A TOKEN COLUMN AND NOT `wishlists.public boolean`. A boolean would
-- expose the list at a URL built from the user id, and a user id is not a
-- secret: it is in every order, every review, every referral row. The link
-- has to be something only the owner has handed out, and something the owner
-- can rotate without changing who they are.
--
-- WHY `enabled` AND NOT DELETE. Turning the link off keeps the row, so
-- turning it back on later hands out the SAME link the owner may already have
-- posted somewhere. Rotating mints a new token and kills the old one on
-- purpose; the app offers both.
--
-- THE CASTS IN THE SELECT ARE DELIBERATE. A SQL-language function's final
-- statement must return the declared types exactly; production stores the
-- money columns as numeric and `images` as json, and the casts make the file
-- hold whichever of numeric/integer and json/jsonb the live column turns out
-- to be, instead of failing at CREATE with "return type mismatch".
--
-- WHY 32..64 CHARACTERS. The app mints 24 random bytes as base64url (32
-- chars, 192 bits). The CHECK is a floor against a bug that would write a
-- short or empty token, not the format itself; a later app may mint longer.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.fn_shared_wishlist(text);
--   DROP TABLE IF EXISTS public.wishlist_shares;

BEGIN;

CREATE TABLE IF NOT EXISTS public.wishlist_shares (
  user_id     uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE CHECK (length(token) BETWEEN 32 AND 64),
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wishlist_shares IS
  'One shareable link per user for their wishlist. The token is the capability: fn_shared_wishlist(token) returns the saved products while enabled. Owner-only in every direction; the public read goes through the function, never the table.';
COMMENT ON COLUMN public.wishlist_shares.token IS
  'Unguessable, minted by the app (24 random bytes, base64url). Rotating replaces it and kills the old link.';
COMMENT ON COLUMN public.wishlist_shares.enabled IS
  'false = the link answers with zero rows. The row is kept so re-enabling restores the same URL.';

-- The 183/226 lesson: never restate a shared function. Create it only if the
-- database somehow lacks it; production already carries the live body.
DO $$
BEGIN
  IF to_regproc('public.set_updated_at') IS NULL THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS wishlist_shares_updated_at ON public.wishlist_shares;
CREATE TRIGGER wishlist_shares_updated_at
  BEFORE UPDATE ON public.wishlist_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wishlist_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wishlist_shares_owner_select" ON public.wishlist_shares;
CREATE POLICY "wishlist_shares_owner_select"
  ON public.wishlist_shares FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "wishlist_shares_owner_insert" ON public.wishlist_shares;
CREATE POLICY "wishlist_shares_owner_insert"
  ON public.wishlist_shares FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "wishlist_shares_owner_update" ON public.wishlist_shares;
CREATE POLICY "wishlist_shares_owner_update"
  ON public.wishlist_shares FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "wishlist_shares_owner_delete" ON public.wishlist_shares;
CREATE POLICY "wishlist_shares_owner_delete"
  ON public.wishlist_shares FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.wishlist_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_shares TO authenticated;

-- ------------------------------------------------------- the public read

-- The token is the only input. No auth.uid(), no user id parameter: a caller
-- cannot ask for "user X's list", only for "the list behind this token", and
-- a token that is unknown or switched off is indistinguishable from an empty
-- list. Only live, active products come back, the same filter the storefront
-- applies (status = 'active', deleted_at IS NULL), so a friend never sees a
-- draft or a soft-deleted product through the side door.
CREATE OR REPLACE FUNCTION public.fn_shared_wishlist(p_token text)
RETURNS TABLE (
  product_id      uuid,
  name_he         text,
  slug            text,
  price_ils       numeric,
  kenyon_price    numeric,
  full_price      numeric,
  images          jsonb,
  stock_quantity  integer,
  added_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    w.product_id,
    p.name_he::text,
    p.slug::text,
    p.price_ils::numeric,
    p.kenyon_price::numeric,
    p.full_price::numeric,
    p.images::jsonb,
    p.stock_quantity::integer,
    w.created_at AS added_at
  FROM public.wishlist_shares s
  JOIN public.wishlists w ON w.user_id = s.user_id
  JOIN public.products  p ON p.id = w.product_id
  WHERE s.token = p_token
    AND s.enabled
    AND length(p_token) BETWEEN 32 AND 64
    AND p.status = 'active'
    AND p.deleted_at IS NULL
  ORDER BY w.created_at DESC
  LIMIT 200;
$$;

COMMENT ON FUNCTION public.fn_shared_wishlist(text) IS
  'The products behind a wishlist share token, while the share is enabled. The token is the whole authorisation; nothing about the owner is returned.';

REVOKE ALL ON FUNCTION public.fn_shared_wishlist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_shared_wishlist(text) TO anon, authenticated;

-- ------------------------------------------------------------------- checks

DO $$
DECLARE
  v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.wishlist_shares'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'RLS is off on wishlist_shares';
  END IF;

  IF has_table_privilege('anon', 'public.wishlist_shares', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read wishlist_shares; the revoke did not take';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'wishlist_shares'
       AND 'anon' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'a policy on wishlist_shares names anon; the table is owner-only';
  END IF;

  -- 154's promise survives this file: still no policy on wishlists for anon.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'wishlists'
       AND 'anon' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'a policy on wishlists names anon; the public read must stay behind the function';
  END IF;

  IF NOT has_function_privilege('anon', 'public.fn_shared_wishlist(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon cannot execute fn_shared_wishlist; a signed-out friend could not open a shared list';
  END IF;
END $$;

COMMIT;
