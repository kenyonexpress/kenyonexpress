-- ROLLBACK: alter table categories drop column if exists sort_order;
-- ============================================================================
-- PENDING: categories.sort_order -- one number per category, and only one
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- ----------------------------------------------------------------------------
-- WHAT IS WRONG
-- ----------------------------------------------------------------------------
--
-- Measured against production on 2026-08-19, read-only, with the query
-- `scripts/seed/launch-bar.mjs` emits:
--
--     electronics    sort_order = 10
--     professionals  sort_order = 10
--
-- Twelve rows carrying the values 1..11. Three storefront reads in
-- `src/lib/category-page.ts` order by that column, so the position of those
-- two relative to each other is whatever the planner returns. All three are
-- `use cache` with `cacheLife('hours')`, so one arbitrary ordering is then
-- served for an hour, and the next fill can serve the other one.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT
-- ----------------------------------------------------------------------------
--
-- One row moves: `electronics` 10 -> 12. Every other slug below already holds
-- the number it is assigned here, so the statement is a no-op for eleven of
-- the twelve and the visible menu order does not change.
--
-- `electronics` goes LAST rather than into the middle because it is not one of
-- the 11 items in the live menu (`KE_LIVE_SPEC.md`). Parking it at 12 makes
-- positions 1..11 exactly the live order. It is NOT deactivated here: it holds
-- 6 active products, and hiding a category that products point at is a content
-- decision, not a numbering fix.
--
-- **NO UNIQUE INDEX ON sort_order.** That is the obvious guard and it would
-- break the admin. `src/components/admin/CategoryTree.tsx:66-67` reorders by
-- swapping two rows through two separate `updateCategorySortOrder` calls, with
-- no transaction and no temporary value; under a unique index the first of the
-- two would fail and reordering would stop working. The invariant is held on
-- the read side instead, by `orderedByMenu()`, which adds `slug` as a second
-- key -- `slug` IS unique, so the order is total no matter what the numbers
-- do. Making the constraint safe means making the swap atomic first, and that
-- is a separate change to a working screen.
--
-- ----------------------------------------------------------------------------
-- AFTER APPLYING
-- ----------------------------------------------------------------------------
--
-- The storefront caches this for an hour behind CATALOGUE_TAG. Nothing in this
-- file can invalidate it; call `updateTag(CATALOGUE_TAG)` from the app (see
-- `src/lib/catalogue-cache.ts`) or wait out `cacheLife('hours')`.
--
-- Verify:
--
--     SELECT count(*) FROM (
--       SELECT sort_order FROM public.categories
--        GROUP BY sort_order HAVING count(*) > 1) d;   -- expect 0
--
-- ============================================================================

-- Idempotent by construction: it assigns absolute values from a fixed list and
-- touches only the slugs named. Re-running it is a no-op, and a slug that is
-- missing from `categories` is simply not matched.
UPDATE public.categories AS c
   SET sort_order = v.sort_order,
       updated_at = now()
  FROM (VALUES
        ('hot-deals',          1),
        ('under-99',           2),
        ('new',                3),
        ('restaurants-cafes',  4),
        ('beauty-health',      5),
        ('phones-computers',   6),
        ('baby-kids',          7),
        ('vacation',           8),
        ('pets',               9),
        ('professionals',     10),
        ('courses',           11),
        -- Not in the live menu. Last, so 1..11 is the live order exactly.
        ('electronics',       12)
       ) AS v(slug, sort_order)
 WHERE c.slug = v.slug
   AND c.sort_order IS DISTINCT FROM v.sort_order;
