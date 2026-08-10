-- ============================================================================
-- PENDING: per-product location -- products.city, products.latitude/longitude
-- ============================================================================
--
-- APPLIED to production 2026-08-10 through MCP apply_migration.
--
-- APPLIED IN REDUCED FORM, and the difference matters. Section 3's
-- `CREATE EXTENSION cube / earthdistance` and the GiST `products_earth_idx`
-- were NOT applied: extension creation needs privileges the MCP connection
-- does not have (the same 42501 class that broke the first
-- revoke_anon_writes attempt). What landed is the three columns, the three
-- CHECKs, and `products_city_idx` -- which is what the search facet and the
-- catalogue actually query today, since zero products carry a coordinate.
--
-- To finish it later, run section 3 alone with a privileged connection.
--
-- VERIFIED AFTER APPLYING: 80 rows, 0 with a city, 0 with coordinates.
--
-- ----------------------------------------------------------------------------
-- WHY A PRODUCT NEEDS A LOCATION WHEN THE SUPPLIER ALREADY HAS ONE
-- ----------------------------------------------------------------------------
--
-- Today the catalogue reads the city off the join: `suppliers(city)` in
-- src/lib/category-page.ts, rendered by CategoryProductCard through
-- `cityByName`. That is one city per business, and it is wrong for the deal
-- this site actually sells. A chain with four branches is one `suppliers` row;
-- a spa weekend is sold by a supplier registered in Tel Aviv and redeemed in
-- Eilat. Sorting those by the supplier's registered address puts the deal
-- hundreds of kilometres from where the customer would go.
--
-- So these columns are an OVERRIDE, not a copy:
--
--     effective city = COALESCE(products.city, suppliers.city)
--
-- NULL means "wherever the supplier is", which is the current behaviour and
-- therefore the behaviour every existing row keeps. Nothing is backfilled; see
-- section 3.
--
-- ----------------------------------------------------------------------------
-- WHY NOT geography(Point,4326)
-- ----------------------------------------------------------------------------
--
-- Measured against this database on 2026-08-10:
--
--     select extname from pg_extension;
--     -> pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp
--
-- PostGIS is not installed. Adding it for one point column per product pulls in
-- a large extension and its own schema, and it would be the SECOND spatial
-- stack here: PENDING-110 already chose `earthdistance` + `cube` for the
-- supplier coordinates, and the application's distance maths
-- (src/lib/geo/distance.ts) is a haversine over plain lat/lng that neither
-- stack is required for. Two ways to say "where" in one schema is how a query
-- ends up joining metres to degrees.
--
-- The columns therefore match PENDING-110 exactly -- numeric(9,6) latitude and
-- longitude -- and the index is GiST over the same `ll_to_earth` expression.
-- numeric(9,6) resolves to about 11cm, which is far past what a street address
-- justifies.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The columns
-- ----------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS city      text,
  ADD COLUMN IF NOT EXISTS latitude  numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);

COMMENT ON COLUMN public.products.city IS
  'Where this deal is redeemed or delivered from, overriding suppliers.city. NULL means "use the supplier''s city" and is the default for every existing row. Free text, matched case- and punctuation-insensitively by cityByName() in src/lib/geo/cities.ts.';
COMMENT ON COLUMN public.products.latitude IS
  'Optional per-product latitude, WGS84. Overrides suppliers.latitude. Must be set together with longitude; see products_coordinates_are_a_pair.';
COMMENT ON COLUMN public.products.longitude IS
  'Optional per-product longitude, WGS84. Overrides suppliers.longitude. Must be set together with latitude.';

-- ----------------------------------------------------------------------------
-- 2. Constraints
--
-- Guarded with DO blocks because ADD CONSTRAINT has no IF NOT EXISTS and this
-- file must be safe to re-run after a partial failure.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_latitude_range') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_latitude_range
      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_longitude_range') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_longitude_range
      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;

  -- A coordinate is a PAIR or it is nothing. Half a coordinate is not partial
  -- data, it is wrong data: latitude 32 with a null longitude reads as {32, 0},
  -- which is in the Atlantic off Ghana, and it would sort as the nearest deal
  -- to nobody while looking like a real row. Same reasoning, same constraint
  -- name shape, as suppliers_coordinates_are_a_pair in PENDING-110.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_coordinates_are_a_pair') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_coordinates_are_a_pair
      CHECK (num_nulls(latitude, longitude) <> 1);
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------

-- earthdistance needs cube. Both are IF NOT EXISTS, and PENDING-110 creates the
-- same pair, so whichever of the two files is applied first pays for it and the
-- second is a no-op.
CREATE EXTENSION IF NOT EXISTS cube          WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA extensions;

-- Partial GiST over the earth-point expression: this is what turns
--   ORDER BY ll_to_earth(latitude, longitude) <-> ll_to_earth($1, $2) LIMIT 20
-- into an index scan. Partial because no product has a coordinate on the day
-- this lands and most never will, so the index covers the rows that have one
-- and costs nothing for the rows that do not.
--
-- Schema-qualified: the extension is not on the search_path of a background
-- worker that might reindex this.
CREATE INDEX IF NOT EXISTS products_earth_idx
  ON public.products
  USING gist (extensions.ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- The city column answers today's query, so it is indexed on the same
-- normalisation the application uses. `lower(btrim(city))` is what cityByName
-- effectively compares, so the database and the code agree on what one city is
-- instead of disagreeing about a trailing space.
CREATE INDEX IF NOT EXISTS products_city_idx
  ON public.products (lower(btrim(city)))
  WHERE city IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. What this file does NOT do
-- ----------------------------------------------------------------------------
--
--  * No backfill. Not one city and not one coordinate is written. Copying
--    suppliers.city down onto products would look like data and would be a
--    guess about which branch a deal belongs to -- and it would freeze that
--    guess, because after the copy NULL no longer means "ask the supplier".
--  * No geocoding. Deriving a coordinate from a business name is the invented
--    data this project refuses everywhere else.
--  * No RLS change. `products` already has its policies and a city is no more
--    sensitive than the supplier address it usually comes from.
--  * No change to suppliers.city, which stays the fallback.
--
-- ============================================================================
-- VERIFICATION (after applying)
-- ============================================================================
--
-- 1. The columns exist and every existing row still defers to its supplier
--    (expect city_set = 0, coords_set = 0):
--
--      SELECT count(*) FILTER (WHERE city IS NOT NULL)     AS city_set,
--             count(*) FILTER (WHERE latitude IS NOT NULL) AS coords_set,
--             count(*)                                     AS total
--      FROM public.products;
--
-- 2. The pair constraint bites (expect ERROR 23514, and a rolled-back block so
--    no row survives):
--
--      DO $$ BEGIN
--        UPDATE public.products SET latitude = 32.08 WHERE id =
--          (SELECT id FROM public.products LIMIT 1);
--        RAISE EXCEPTION 'rollback: the pair constraint did not fire';
--      END $$;
--
-- 3. The index is used rather than merely present:
--
--      EXPLAIN SELECT id FROM public.products
--      WHERE latitude IS NOT NULL
--      ORDER BY extensions.ll_to_earth(latitude::float8, longitude::float8)
--               <-> extensions.ll_to_earth(32.0853, 34.7818)
--      LIMIT 20;
--
-- ROLLBACK
--
--   DROP INDEX IF EXISTS public.products_earth_idx;
--   DROP INDEX IF EXISTS public.products_city_idx;
--   ALTER TABLE public.products
--     DROP CONSTRAINT IF EXISTS products_coordinates_are_a_pair,
--     DROP CONSTRAINT IF EXISTS products_latitude_range,
--     DROP CONSTRAINT IF EXISTS products_longitude_range,
--     DROP COLUMN IF EXISTS latitude,
--     DROP COLUMN IF EXISTS longitude,
--     DROP COLUMN IF EXISTS city;
-- ============================================================================
