-- ============================================================================
-- PENDING: per-supplier coordinates and the distance index
-- ============================================================================
--
-- STATUS: NOT APPLIED. Awaiting Ofir's explicit approval, same as 135.
-- Apply ONLY through MCP apply_migration, never db push. The filename
-- deliberately breaks the NNN_ prefix convention so no tooling picks it up.
--
-- MEASURED AGAINST PRODUCTION 2026-08-07, BEFORE A LINE WAS WRITTEN
--
--   suppliers: `city` (text, nullable) and `address` (text, nullable) EXIST.
--   No column matching %lat%, %lng%, %lon% or %geo% exists.
--   pg_extension has neither `cube` nor `earthdistance` nor `postgis`.
--
--   Supplier data as it actually stands, all 11 rows:
--     city filled in : 5   (תל אביב, ירושלים, חיפה, באר שבע, הרצליה - one each)
--     city null      : 6
--     address filled : 0   <- NOT ONE
--
-- THAT LAST NUMBER IS WHY THE APPLICATION DOES NOT WAIT FOR THIS FILE
--
-- There is nothing to geocode. Adding lat/lng columns today would add eleven
-- NULLs. So `src/lib/geo/cities.ts` computes distance from the CITY CENTRE,
-- which is honest at the resolution the data has: it can tell Tel Aviv from
-- Haifa, and it does not pretend to know the street.
--
-- These columns are the upgrade path, not the current mechanism.
-- `supplierLocation()` already prefers `latitude`/`longitude` when they are
-- present and falls back to the city otherwise, so applying this migration and
-- filling in one supplier's coordinates improves that supplier immediately and
-- changes nothing for the others.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS latitude  numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);

-- numeric(9,6) is about 11 cm of precision and cannot hold an out-of-range
-- value by accident. The CHECKs are the real guard: a swapped lat/lng pair is
-- the classic geo bug, and in Israel (lat ~31, lng ~35) both values are in
-- range for each other, so ONLY the explicit bounds catch a swap that puts a
-- Tel Aviv business in the Indian Ocean. They cannot catch every swap; they
-- catch every impossible one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_latitude_range') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_latitude_range
      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_longitude_range') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_longitude_range
      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;

  -- Half a coordinate is not a location. Without this, a row with a latitude
  -- and no longitude reads as {32, 0} to anything that coalesces, which is a
  -- point in the Atlantic off Ghana. The application already refuses such a
  -- row (see supplierLocation); this makes it unstorable.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_coordinates_are_a_pair') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_coordinates_are_a_pair
      CHECK ((latitude IS NULL) = (longitude IS NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.latitude IS
  'Municipal-accurate or better. NULL means "use the city centre" - see '
  'src/lib/geo/cities.ts. Never defaulted to 0: zero is a real place.';

-- ---------------------------------------------------------------------------
-- 2. earthdistance, and the index that makes a radius query cheap
-- ---------------------------------------------------------------------------
--
-- cube first: earthdistance depends on it and will not install otherwise.
-- Both go in the `extensions` schema rather than `public`, which is the
-- Supabase convention and keeps `public` free of ~30 operator names.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS cube WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA extensions;

-- A GiST index over the earth-point expression. This is what turns
--   ORDER BY ll_to_earth(lat,lng) <-> ll_to_earth($1,$2) LIMIT 20
-- from a full scan into an index scan.
--
-- Partial, because most suppliers have no coordinate and never will until
-- somebody types an address: indexing eleven NULLs would be pure overhead.
--
-- The expression is IMMUTABLE, which ll_to_earth requires for an index. It is
-- schema-qualified because the extension is not in the search_path of a
-- background worker that might reindex this.
CREATE INDEX IF NOT EXISTS suppliers_earth_idx
  ON public.suppliers
  USING gist (extensions.ll_to_earth(latitude::float8, longitude::float8))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- The city column is what actually answers today's queries, so it gets an index
-- too. Case-insensitive on the trimmed value, matching what cityByName does in
-- the application, so the database and the code agree on what "one city" means.
CREATE INDEX IF NOT EXISTS suppliers_city_idx
  ON public.suppliers (lower(btrim(city)))
  WHERE city IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. What this file does NOT do
-- ---------------------------------------------------------------------------
--
--  * No backfill and no geocoding. Not one coordinate is written. Guessing a
--    business's location from its name is exactly the kind of invented data
--    this project refuses everywhere else.
--  * No change to `city` or `address`.
--  * No RLS change: suppliers already has its policies and coordinates are no
--    more sensitive than the address they come from.
