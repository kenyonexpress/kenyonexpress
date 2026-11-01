-- 195_stock_waitlist.sql
--
-- "Tell me when it is back."
--
-- WHAT THE SOLD-OUT PAGE DOES TODAY: nothing. `ProductInfo` prints "אזל מהמלאי",
-- disables the button, and that is where the visitor's interest ends. They came
-- for a specific thing, it was not there, and the shop learned nothing from the
-- visit -- not that the product is wanted, not who wanted it, not how many.
--
-- MEASURED 2026-09-09, and it is the reason this is small: **no active product
-- is at zero stock.** 44 active, 0 sold out, 19 with `stock_quantity IS NULL`
-- (untracked, so never sold out by construction). The sold-out branch exists in
-- the UI and nothing in production currently reaches it. This is built for the
-- first time it does rather than to fix something bleeding today, and it is
-- sized accordingly.
--
-- ONE ROW PER PERSON PER PRODUCT, not one per click. A visitor who taps the
-- button three times is one interested person; three rows would make the
-- restock mail arrive three times and would inflate the only number this table
-- is for.
--
-- EMAIL IS THE KEY, NOT THE USER ID. A guest can want a restock, and requiring
-- an account to ask for one converts the moment of interest into a signup form.
-- `user_id` is recorded when there is one, so a logged-in shopper's requests
-- can be shown in their account later, but the identity that matters here is
-- the address the mail goes to.
--
-- NOTIFIED, NOT DELETED. `notified_at` marks a row as sent rather than removing
-- it, so "we told 40 people and 3 bought" stays answerable, and so a second
-- restock of the same product does not mail the same person again unless they
-- ask again.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  -- Stored lowercased and trimmed by the writer. The uniqueness below is over
  -- this column, so two spellings of one address would be two people.
  email       text NOT NULL CHECK (position('@' in email) > 1),
  user_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

COMMENT ON TABLE public.stock_waitlist IS
  'Who asked to be told when a sold-out product returns. One live row per email per product; see docs/INVENTORY.md.';

-- One LIVE request per person per product. Partial on `notified_at IS NULL` so
-- a person who was mailed about a previous restock can ask again for the next
-- one -- which is a different request, not a duplicate of the old one.
CREATE UNIQUE INDEX IF NOT EXISTS stock_waitlist_one_live_request
  ON public.stock_waitlist (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), email)
  WHERE notified_at IS NULL;

-- The read the restock job makes: everyone still waiting on one product.
CREATE INDEX IF NOT EXISTS stock_waitlist_pending
  ON public.stock_waitlist (product_id) WHERE notified_at IS NULL;

-- ------------------------------------------------------------------------ RLS
--
-- A row here is an email address next to a purchase intention, so it is not
-- readable by any client role -- a public SELECT would turn the waitlist into a
-- list of customers' addresses that anyone could page through. Writes go
-- through the server action, which holds the service role.
--
-- RESTRICTIVE rather than "no policies", the shape 172 installed: a permissive
-- policy added later cannot outvote it, whereas an empty policy list stops
-- protecting the table the moment somebody adds one.

ALTER TABLE public.stock_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_waitlist_deny_all_client_roles" ON public.stock_waitlist;
CREATE POLICY "stock_waitlist_deny_all_client_roles"
  ON public.stock_waitlist
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.stock_waitlist FROM anon, authenticated;

-- ------------------------------------------------------------------- the join
--
-- SECURITY DEFINER because the caller is the storefront's anon-scoped path and
-- the table denies it, and because the alternative -- letting the client insert
-- -- is a table anyone can fill with other people's addresses.
--
-- It does NOT return whether the row already existed. That is deliberate: a
-- caller who could tell "already on the list" from "added" could use this
-- endpoint to test whether a given email address is watching a given product,
-- which is somebody else's business. The action answers the same way either
-- way.

CREATE OR REPLACE FUNCTION public.join_stock_waitlist(
  p_product_id uuid,
  p_email      text,
  p_variant_id uuid DEFAULT NULL,
  p_user_id    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF position('@' in v_email) < 2 THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;

  -- Only for a product that exists and is not deleted. Without this the table
  -- accepts any uuid a caller invents and becomes a place to write arbitrary
  -- rows keyed on nothing.
  PERFORM 1 FROM public.products p WHERE p.id = p_product_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown product' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.stock_waitlist (product_id, variant_id, email, user_id)
  VALUES (p_product_id, p_variant_id, v_email, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.join_stock_waitlist(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_stock_waitlist(uuid, text, uuid, uuid) TO service_role;

COMMIT;
