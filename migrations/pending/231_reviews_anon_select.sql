-- 231_reviews_anon_select.sql
--
-- Gives `anon` SELECT on the public columns of `reviews`, so a guest can read
-- the approved reviews that `reviews_public_read_approved` (154) already lets
-- every role see.
--
-- =============================================================================
-- WHAT WAS MEASURED, 2026-10-07, AGAINST PRODUCTION (M06-c117)
-- =============================================================================
--
--   GET /rest/v1/reviews?select=id&limit=1   with the anon key
--   -> 401 {"code":"42501","message":"permission denied for table reviews"}
--   GET /rest/v1/products?select=id&limit=1  with the anon key
--   -> 200
--
-- The policy exists; the grant under it does not. So every public read in
-- `src/server/queries/reviews.ts` (`getProductReviews`, `getRatingSummaries`)
-- fails before RLS is consulted. `pnpm build` logged 182 `supabase.rls_denied`
-- lines on `reviews` while prerendering, and the product pages and grids render
-- no rating for anyone who is not signed in. It is invisible today only because
-- production holds 0 approved reviews.
--
-- =============================================================================
-- WHY COLUMN-LEVEL AND NOT TABLE-WIDE
-- =============================================================================
--
-- `user_id`, `order_item_id`, `reviewed_by` and `reviewed_at` identify the
-- buyer, the purchase and the moderator. The policy filters rows, not columns,
-- so a table-wide grant would hand all four to any guest for every approved
-- review. The list below is exactly what the public queries select or filter
-- on, and nothing else.
--
-- Columns added by pending files (`title` 189, `helpful_count` 222) are granted
-- only if they exist when this runs. Apply this AFTER 189 and 222, or re-run it
-- after them; it is idempotent.
--
-- =============================================================================
-- REVERSAL
-- =============================================================================
--
--   REVOKE SELECT ON public.reviews FROM anon;

BEGIN;

DO $$
DECLARE
  wanted text[] := ARRAY[
    'id', 'product_id', 'rating', 'title', 'body', 'status', 'created_at',
    'supplier_reply', 'supplier_replied_at', 'helpful_count'
  ];
  present text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO present
    FROM pg_attribute a
   WHERE a.attrelid = 'public.reviews'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attname = ANY (wanted);

  IF present IS NULL THEN
    RAISE EXCEPTION '231: none of the public review columns exist';
  END IF;

  EXECUTE format('GRANT SELECT (%s) ON public.reviews TO anon', present);
END
$$;

-- The private columns must stay unreadable to a guest.
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.reviews', 'user_id', 'SELECT')
     OR has_column_privilege('anon', 'public.reviews', 'order_item_id', 'SELECT') THEN
    RAISE EXCEPTION '231: anon can read user_id or order_item_id on reviews';
  END IF;
END
$$;

COMMIT;
