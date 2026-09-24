-- 242_product_price_source_google_reviews.sql
--
-- Q04 (final-queue, 2026-09-25): the product page states WHERE the struck-through
-- "regular price" comes from, and links the supplier's Google reviews.
--
-- TWO ADDITIVE COLUMNS ON `products`, ONE ON `suppliers`. Nothing existing is
-- altered, dropped or rewritten, and every statement is idempotent.
--
-- WHY A SOURCE FOR THE ORIGINAL PRICE. `products.full_price` is the number a
-- struck-through price is painted from, and src/lib/pricing/reference-price.ts
-- records the measured state: on 2026-09-09, 15 of 44 active products showed a
-- crossed-out price and not one of them had evidence it was ever charged. The
-- price-history verdict (193) hides a claim the record CONTRADICTS; this column
-- is the other half -- what the operator is basing the claim on when nothing
-- contradicts it. It is a short label the shopper reads ("מחירון היצרן",
-- "מחיר באתר הספק", "מחיר קודם בחנות") plus an optional https link to the
-- evidence. The storefront prints it beside the struck price and in the small
-- print, and prints nothing when it is NULL. It does not decide whether the
-- strike is shown: that stays with the 30-day verdict.
--
-- WHY A GOOGLE REVIEWS URL ON THE SUPPLIER. Every product page carries the
-- supplier block (address + Waze, phone + WhatsApp, docs/BUSINESS-MODEL.md §2).
-- A link to the business's Google reviews is the one trust signal that is not
-- ours to fabricate, so it is a URL the operator pastes, constrained to Google
-- hosts, and the page renders a link only when it parses.
--
-- READ PATHS. `products` is read with the anon key on the storefront, so the
-- two product columns get an explicit column-level SELECT grant; it is a
-- no-op where a table-level grant already exists. `suppliers` is admin-only
-- under RLS and is read through the service client, so no grant is added.
--
-- THE CODE RUNS WITHOUT THIS FILE. Both reads go through
-- src/lib/supabase/optional-columns.ts: a 42703 (undefined column) is logged
-- once and read as NULL, so the page shows no source and no reviews link until
-- this is applied. Rehearse with BEGIN ... ROLLBACK per docs/RUNBOOK.md.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS original_price_source text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS original_price_source_url text;

COMMENT ON COLUMN public.products.original_price_source IS
  'Short Hebrew label naming what full_price (the struck-through "regular price") is based on. Shown to the shopper. NULL = no basis stated.';

COMMENT ON COLUMN public.products.original_price_source_url IS
  'Optional https link to the evidence behind original_price_source (manufacturer list, supplier site). Rendered as a link only when original_price_source is set.';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_original_price_source_len;
ALTER TABLE public.products
  ADD CONSTRAINT products_original_price_source_len
  CHECK (
    original_price_source IS NULL
    OR length(btrim(original_price_source)) BETWEEN 2 AND 120
  );

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_original_price_source_url_https;
ALTER TABLE public.products
  ADD CONSTRAINT products_original_price_source_url_https
  CHECK (
    original_price_source_url IS NULL
    OR original_price_source_url ~ '^https://[^[:space:]]{1,2000}$'
  );

GRANT SELECT (original_price_source, original_price_source_url)
  ON public.products TO anon, authenticated;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS google_reviews_url text;

COMMENT ON COLUMN public.suppliers.google_reviews_url IS
  'The business''s Google reviews page (google.* / maps.app.goo.gl / g.page). Linked from every product page of the supplier when set.';

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_google_reviews_url_host;
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_google_reviews_url_host
  CHECK (
    google_reviews_url IS NULL
    -- The TLD part is tight on purpose: `google\.[a-z.]+` also accepted
    -- `google.com.evil.io`. This covers google.com, google.co.il, google.de
    -- and google.com.au, and is the same expression as GOOGLE_HOST in
    -- src/lib/pricing/original-price-source.ts.
    OR google_reviews_url ~ '^https://([a-z0-9-]+\.)*(google\.[a-z]{2,3}(\.[a-z]{2})?|goo\.gl|g\.page)/[^[:space:]]*$'
  );

COMMIT;
