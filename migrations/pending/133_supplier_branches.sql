-- ============================================================================
-- PENDING 123: supplier_branches, so a chain is more than one pin
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- MEASURED BEFORE WRITING (2026-08-19; the numbers are from 2026-08-07 and
-- 2026-08-10 and nothing has changed them):
--   suppliers  : 11 rows. city set on 5. address set on 0.
--   products   : 80 rows. city set on 0. coordinates on 0.
--   extensions : no postgis, no cube, no earthdistance.
--   There is no table matching %branch% or %location%.
--
-- THIS TABLE CHANGES NO MONEY AND NO AUTHORISATION. A voucher is redeemed
-- against suppliers.id, as it is today. A branch is a place a customer walks
-- into, and nothing else.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_branches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,

  name         text NOT NULL,          -- 'סניף דיזנגוף'
  city         text,                   -- matched by cityByName(), same as products.city
  address      text,
  phone        text,

  -- Same shape and same rules as products/suppliers: numeric(9,6), a PAIR or
  -- nothing. Deliberately identical so one distance function serves all three
  -- and nobody has to remember which table stores degrees differently.
  latitude     numeric(9,6),
  longitude    numeric(9,6),

  -- Opening hours as jsonb rather than seven pairs of columns: the shape is
  -- genuinely irregular (split shifts, Friday, holiday eves) and nothing sorts
  -- or filters on it. Display only.
  hours        jsonb NOT NULL DEFAULT '{}'::jsonb,

  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supplier_branches_latitude_range
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT supplier_branches_longitude_range
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  -- Half a coordinate is wrong data, not partial data. Same name shape as
  -- products_coordinates_are_a_pair and suppliers_coordinates_are_a_pair.
  CONSTRAINT supplier_branches_coordinates_are_a_pair
    CHECK (num_nulls(latitude, longitude) <> 1),
  -- A branch with neither a city nor a coordinate cannot be placed on any map
  -- or sorted by any distance, so it is a name with no location, which is what
  -- coupon_terms_he is for.
  CONSTRAINT supplier_branches_is_somewhere
    CHECK (city IS NOT NULL OR latitude IS NOT NULL)
);

COMMENT ON TABLE public.supplier_branches IS
  'Physical locations of one supplier. A place, not a business: no percentages, no settlement. Redemption authorisation stays on suppliers.id.';

CREATE INDEX IF NOT EXISTS supplier_branches_supplier_idx
  ON public.supplier_branches (supplier_id, sort_order)
  WHERE is_active;

-- Same normalisation as products_city_idx: lower(btrim(city)) is what
-- cityByName() effectively compares.
CREATE INDEX IF NOT EXISTS supplier_branches_city_idx
  ON public.supplier_branches (lower(btrim(city)))
  WHERE city IS NOT NULL AND is_active;

-- The GiST distance index is COMMENTED OUT, not omitted silently.
-- `cube` and `earthdistance` are still not installed: 113 tried and hit 42501,
-- because extension creation needs privileges the MCP connection lacks. Run
-- this pair with a privileged connection first, together with 113 section 3.
--
--   CREATE EXTENSION IF NOT EXISTS cube          WITH SCHEMA extensions;
--   CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA extensions;
--   CREATE INDEX IF NOT EXISTS supplier_branches_earth_idx
--     ON public.supplier_branches
--     USING gist (extensions.ll_to_earth(latitude::float8, longitude::float8))
--     WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
--
-- Until then the city index answers every query the application makes, because
-- zero rows anywhere carry a coordinate.

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_branches;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. auth.uid() and role. No tenant_id.
-- ---------------------------------------------------------------------------
ALTER TABLE public.supplier_branches ENABLE ROW LEVEL SECURITY;

-- A branch is public information: it is an address a customer needs in order to
-- walk in. Inactive branches are not, because an inactive branch is a closed
-- shop and sending somebody there is worse than saying nothing.
DROP POLICY IF EXISTS supplier_branches_public_read ON public.supplier_branches;
CREATE POLICY supplier_branches_public_read ON public.supplier_branches
  FOR SELECT TO anon, authenticated
  USING (is_active AND EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_branches.supplier_id AND s.deleted_at IS NULL
  ));

-- The supplier's own members manage their branches. (SELECT auth.uid()) rather
-- than auth.uid(): InitPlan once, not once per row -- the same fix commit
-- 0f8359bc applied across the schema.
-- THE COLUMN IS `member_role`, NOT `role`, AND `is_active` IS NOT OPTIONAL.
--
-- This policy named `m.role` and the migration failed to apply: there is no
-- such column on `supplier_members`. The real column is `member_role`, of enum
-- `supplier_member_role` (owner, manager, scanner).
--
-- `m.is_active` is added for a second reason, and it is the one that matters:
-- without it, revoking somebody's access by clearing the flag would leave them
-- still able to write branches, because the membership row is still there with
-- its role intact. Deactivation has to mean deactivation at the policy level,
-- not only in the UI that stops showing them the button.
DROP POLICY IF EXISTS supplier_branches_member_write ON public.supplier_branches;
CREATE POLICY supplier_branches_member_write ON public.supplier_branches
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.supplier_members m
    WHERE m.supplier_id = supplier_branches.supplier_id
      AND m.user_id = (SELECT auth.uid())
      AND m.is_active
      AND m.member_role IN ('owner','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.supplier_members m
    WHERE m.supplier_id = supplier_branches.supplier_id
      AND m.user_id = (SELECT auth.uid())
      AND m.is_active
      AND m.member_role IN ('owner','manager')
  ));

DROP POLICY IF EXISTS supplier_branches_admin_all ON public.supplier_branches;
CREATE POLICY supplier_branches_admin_all ON public.supplier_branches
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin','super_admin'));

-- anon reads, anon never writes. 111_revoke_anon_writes is the standing rule.
REVOKE INSERT, UPDATE, DELETE ON public.supplier_branches FROM anon;
GRANT SELECT ON public.supplier_branches TO anon, authenticated;

-- ============================================================================
-- VERIFICATION (after applying, inside rolled-back DO blocks)
-- ============================================================================
-- 1. The pair constraint bites:
--      INSERT INTO public.supplier_branches (supplier_id, name, latitude)
--      VALUES ((SELECT id FROM public.suppliers LIMIT 1), 'test', 32.08);
--    Expect 23514 (both the pair check and is_somewhere would fire).
--
-- 2. A branch with no location is refused:
--      INSERT ... (supplier_id, name) VALUES (..., 'test');
--    Expect 23514 on supplier_branches_is_somewhere.
--
-- 3. anon cannot see an inactive branch:
--      set role anon;
--      SELECT count(*) FROM public.supplier_branches WHERE NOT is_active;
--    Expect 0.
--
-- 4. A scanner cannot write:
--      a supplier_members row with member_role 'scanner' -> INSERT fails 42501.
--      the same row with member_role 'owner' but is_active false -> also 42501.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.supplier_branches;
-- ============================================================================
