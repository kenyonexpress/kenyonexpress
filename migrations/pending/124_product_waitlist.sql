-- 124: product_waitlist, the "tell me when it is back" list.
--
-- NOT APPLIED. Nothing in migrations/pending/ has been run.
--
-- WHY IT EXISTS. A sold-out product page currently ends the conversation:
-- the badge says אזל מהמלאי and the shopper leaves with nothing to come back
-- to. `components/product/WaitlistForm.tsx` collects an address there, and
-- `app/(store)/product/waitlist.ts` writes it here.
--
-- UNTIL THIS IS APPLIED THE FORM STILL SHIPS, AND SAYS SO. The action treats
-- 42P01 (undefined_table) as "the waitlist is not open yet" and tells the
-- shopper exactly that, rather than throwing. A missing table must not turn a
-- sold-out page into a 500.
--
-- WHAT THIS IS NOT: a marketing list. Nothing here subscribes anybody to
-- anything. The consent is single-purpose and named in the copy beside the
-- field -- one message, about one product, when that product returns -- and
-- `notified_at` is what closes it. Section 30A governs the newsletter, which
-- is a different table with a double opt-in of its own
-- (`newsletter_subscribers`); reusing that consent for this, or this one for
-- that, is exactly the drift the two separate tables prevent.

CREATE TABLE IF NOT EXISTS public.product_waitlist (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Stored lower-cased and trimmed by the action, so the unique index below
  -- means one address per product rather than one spelling per product.
  email       text        NOT NULL,
  -- Set when a signed-in shopper asks; null for a guest. Nothing depends on
  -- it, so RLS never resolves the row through it.
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Where on the site the address was typed, for reading the numbers later.
  source      text        NOT NULL DEFAULT 'product-page',
  -- Consent evidence, matching what `newsletter_subscribers` keeps: the hash
  -- proves two requests came from the same place without storing the address
  -- of either. Raw IPs are deliberately not kept.
  ip_hash     text,
  user_agent  text,
  -- Stamped when the one message this row entitles us to send has been sent.
  -- A row with a value here is spent, and the action refuses to resend.
  notified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One address per product. A shopper who submits twice updates their own row
-- instead of creating a second reason to mail them.
CREATE UNIQUE INDEX IF NOT EXISTS product_waitlist_product_email_key
  ON public.product_waitlist (product_id, lower(email));

-- The query the restock job runs: everyone still owed a message for a product.
CREATE INDEX IF NOT EXISTS product_waitlist_pending_idx
  ON public.product_waitlist (product_id)
  WHERE notified_at IS NULL;

-- 001 is not idempotent and may have stopped early on a live database, so the
-- trigger's function is restated before it is referenced.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.product_waitlist;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.product_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_waitlist ENABLE ROW LEVEL SECURITY;

-- Admin read only, and no INSERT/UPDATE/DELETE policy for anyone.
--
-- THE ABSENCE IS THE DESIGN, and it is the same call 115 made for
-- analytics_events. The writes come from the server action through the service
-- role, which bypasses RLS. Granting `anon` an INSERT here would hand the
-- open internet a way to write arbitrary rows keyed to any product, and
-- granting SELECT to anyone but an admin would turn the table into an oracle
-- for "is this address a customer of ours".
DROP POLICY IF EXISTS "product_waitlist: admin read" ON public.product_waitlist;
CREATE POLICY "product_waitlist: admin read"
  ON public.product_waitlist
  FOR SELECT USING (public.is_admin());

-- Belt and braces against a future GRANT ALL sweep: the table is service-role
-- and admin territory, and neither of these roles has business here.
REVOKE ALL ON public.product_waitlist FROM anon, authenticated;

COMMENT ON TABLE public.product_waitlist IS
  'Single-purpose restock notifications. One message per row, about one product. NOT a marketing list: newsletter consent lives in newsletter_subscribers and the two never cross.';
