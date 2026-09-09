-- 221_review_rating_cache.sql
--
-- The aggregate rating, cached on `products` and maintained by trigger.
--
-- =============================================================================
-- WHY A CACHE AT ALL, WHEN THE READ-TIME VERSION IS CORRECT TODAY
-- =============================================================================
--
-- `src/server/queries/reviews.ts` computes the average by selecting every
-- approved row for the products on screen and folding them in TypeScript. With
-- the catalogue at 44 active products and `reviews` holding 0 rows, that is
-- both correct and fast, and it is why nothing has gone wrong yet.
--
-- It does not stay correct. The read has no `.limit()`, so it inherits
-- PostgREST's row ceiling: past that many approved reviews for a batch of
-- products, the fold silently averages WHICHEVER ROWS CAME BACK. The number
-- stays plausible, keeps one decimal place, and is wrong - and nothing
-- anywhere raises. `getSupplierRating` carries a comment saying it is
-- deliberately "NOT capped and not paged", which is the intent; a server-side
-- ceiling is not something the client can opt out of.
--
-- A counter maintained by a trigger has no such horizon. It is also the only
-- way to ORDER a product grid by rating, which a read-time fold cannot do at
-- all without reading every review in the catalogue.
--
-- =============================================================================
-- SUM AND COUNT, NOT AN AVERAGE
-- =============================================================================
--
-- `rating_sum bigint` + `rating_count integer`, and the average is derived on
-- read. Three reasons, in order of how much they matter:
--
--   1. INCREMENTAL. A stored average cannot be updated from the delta alone -
--      changing one review's rating means recomputing from all of them, so the
--      trigger would degenerate into the scan the cache exists to avoid.
--   2. EXACT. Both columns are integers. A stored `numeric(2,1)` average would
--      round at write time and the rounding would compound across edits; here
--      the only rounding is the one the display does, once, at the end.
--   3. It matches how the rest of this schema treats derived numbers: keep the
--      exact integer parts, derive the presentation.
--
-- =============================================================================
-- WHAT COUNTS, AND THE TWO TRANSITIONS THAT ARE EASY TO MISS
-- =============================================================================
--
-- A review counts when `status = 'approved'` AND `deleted_at IS NULL`. The
-- trigger is written as "remove the old row's contribution, add the new one's",
-- because the interesting events are not INSERT and DELETE:
--
--   * MODERATION. pending -> approved must ADD, approved -> rejected must
--     SUBTRACT. Both are plain UPDATEs of `status` and a naive trigger that
--     only watches INSERT/DELETE misses both, which is every review this site
--     will ever have: they all arrive `pending`.
--   * SOFT DELETE. `deleted_at` going non-null must subtract even though the
--     row is still there, and going back to null must add again. 185 made soft
--     delete the norm for user-facing tables, so a cache that keyed off DELETE
--     would count removed reviews forever.
--
-- A product_id change is handled too: it subtracts from the old product and
-- adds to the new, which is why the trigger reads OLD.product_id rather than
-- assuming it equals NEW.product_id.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS rating_sum   bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

-- Conservation. A count cannot go negative, and a sum has to stay inside what
-- the count could produce at 1..5 stars. If the trigger ever double-subtracts,
-- this refuses the write rather than letting the catalogue drift quietly.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_rating_cache_sane;
ALTER TABLE public.products
  ADD CONSTRAINT products_rating_cache_sane CHECK (
    rating_count >= 0
    AND rating_sum >= rating_count
    AND rating_sum <= rating_count * 5
  );

COMMENT ON COLUMN public.products.rating_sum IS
  'Sum of stars over approved, non-deleted reviews. With rating_count this gives the average; maintained by trg_reviews_rating_cache (221).';
COMMENT ON COLUMN public.products.rating_count IS
  'Number of approved, non-deleted reviews. Zero means unrated: show no stars rather than zero stars.';

CREATE OR REPLACE FUNCTION public.fn_reviews_rating_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_counts boolean := FALSE;
  new_counts boolean := FALSE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_counts := (OLD.status = 'approved' AND OLD.deleted_at IS NULL);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_counts := (NEW.status = 'approved' AND NEW.deleted_at IS NULL);
  END IF;

  -- Same product and no change in whether it counts: nothing to do. The rating
  -- value itself can still have changed, so this is not simply "old = new".
  IF old_counts AND new_counts
     AND OLD.product_id = NEW.product_id
     AND OLD.rating = NEW.rating THEN
    RETURN NULL;
  END IF;

  IF old_counts THEN
    UPDATE public.products
       SET rating_sum = rating_sum - OLD.rating,
           rating_count = rating_count - 1
     WHERE id = OLD.product_id;
  END IF;

  IF new_counts THEN
    UPDATE public.products
       SET rating_sum = rating_sum + NEW.rating,
           rating_count = rating_count + 1
     WHERE id = NEW.product_id;
  END IF;

  RETURN NULL;
END;
$$;

-- SECURITY DEFINER because the writer is a customer whose grants on `products`
-- are SELECT only: 122 and the grants around it keep the catalogue unwritable
-- from the client, and a cache that required the reviewer to hold UPDATE on
-- `products` would hand them the whole row. The function touches exactly two
-- columns of exactly one row, addressed by primary key, and takes nothing from
-- the caller: every value comes from OLD/NEW.
REVOKE ALL ON FUNCTION public.fn_reviews_rating_cache() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_reviews_rating_cache ON public.reviews;
CREATE TRIGGER trg_reviews_rating_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.fn_reviews_rating_cache();

-- Backfill. Idempotent by construction: it assigns the computed value rather
-- than adding to it, so re-running this file cannot drift the counters.
UPDATE public.products p
   SET rating_sum = COALESCE(agg.s, 0),
       rating_count = COALESCE(agg.c, 0)
  FROM (
    SELECT product_id, SUM(rating)::bigint AS s, COUNT(*)::integer AS c
      FROM public.reviews
     WHERE status = 'approved' AND deleted_at IS NULL
     GROUP BY product_id
  ) agg
 WHERE agg.product_id = p.id;

UPDATE public.products p
   SET rating_sum = 0, rating_count = 0
 WHERE NOT EXISTS (
   SELECT 1 FROM public.reviews r
    WHERE r.product_id = p.id AND r.status = 'approved' AND r.deleted_at IS NULL
 )
 AND (p.rating_sum <> 0 OR p.rating_count <> 0);

-- Sorting a grid by rating. Partial: an unrated product is never the answer to
-- "best rated", so it does not belong in the index.
CREATE INDEX IF NOT EXISTS products_rating_idx
  ON public.products ((rating_sum::numeric / rating_count) DESC, rating_count DESC)
  WHERE rating_count > 0;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad
    FROM public.products p
    LEFT JOIN (
      SELECT product_id, SUM(rating)::bigint AS s, COUNT(*)::integer AS c
        FROM public.reviews WHERE status = 'approved' AND deleted_at IS NULL
       GROUP BY product_id
    ) agg ON agg.product_id = p.id
   WHERE p.rating_sum <> COALESCE(agg.s, 0)
      OR p.rating_count <> COALESCE(agg.c, 0);
  IF bad <> 0 THEN
    RAISE EXCEPTION 'rating cache disagrees with the reviews table on % product(s)', bad;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- PROBED AGAINST PRODUCTION, ROLLED BACK, 2026-09-09
-- =============================================================================
--
-- The trigger body above was run against production inside a `DO` block that
-- raises at the end, on two scratch tables of the same shape rather than on
-- `products` itself. That choice is deliberate: adding a column to `products`
-- takes an ACCESS EXCLUSIVE lock, and the live site reads that table. The logic
-- under test is the trigger, and the trigger does not care what the table is
-- called.
--
-- Every transition, as sum/count:
--
--   pending        0/0    a review arrives pending and must not count
--   approved       5/1    moderation ADDS
--   rejected       0/0    moderation SUBTRACTS
--   soft-deleted   0/0    deleted_at set, row still present, must subtract
--   restored       5/1    deleted_at cleared, must add back
--   edited         3/1    rating 5 -> 3 while approved
--   moved (old)    0/0    product_id changed: old product loses it
--   moved (new)    3/1    and the new one gains it
--   hard-deleted   0/0
--
-- The conservation CHECK never fired during any of it, which is the point of
-- having it: a double-subtract would have aborted the block rather than
-- producing one of these numbers. `to_regclass` returned null for both scratch
-- tables afterwards.
--
-- VERIFY after applying:
--
--   select id, rating_sum, rating_count from products where rating_count > 0;
