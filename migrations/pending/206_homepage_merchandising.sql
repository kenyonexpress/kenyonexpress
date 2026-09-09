-- 206_homepage_merchandising.sql
--
-- Four more section kinds, and the window check 127 did not have.
--
-- =============================================================================
-- WHAT IS ALREADY LIVE, MEASURED BEFORE ANYTHING WAS WRITTEN
-- =============================================================================
--
-- `127_homepage_cms.sql` IS APPLIED. `homepage_sections`, `banners`,
-- `v_homepage_sections_live` and `v_banners_live` all exist in production, with
-- RLS on and the schedule evaluated in the views against the database's own
-- clock.
--
-- BOTH TABLES HOLD ZERO ROWS. Read off production 2026-09-09. So the machinery
-- is live and inert: `readHomepageContent` returns `AUTHORED_CONTENT` on every
-- request, only the HERO is wired to it at all, and no operator can reach any
-- of it because there is no console. That is the shape of [59]'s work, and it
-- is mostly application code. This file is the small database part.
--
-- =============================================================================
-- 1. FOUR KINDS THE CHECK REFUSES TODAY
-- =============================================================================
--
-- `homepage_sections.kind` is a closed set, deliberately: 127 says "a section
-- kind the code has no component for renders nothing, and an editor who typed
-- it would see an empty home page with no error". The set is
-- `hero, categories, benefits, deals, featured, city_deals, banner_row`, and
-- [59] asks for four things that are not in it:
--
--   product_rail        a row of products, chosen manually or by a rule
--   category_spotlight  one category, with its own products
--   supplier_spotlight  one business, with its own products
--   countdown           a banner counting down to a deadline
--
-- `featured` stays in the set and is NOT reused for the rail. It was in 127's
-- list, it has never had a component, and a kind that means "some products,
-- configured how exactly" is the ambiguity a closed set exists to prevent.
-- `product_rail` says which products by saying `source` in its config.
--
-- =============================================================================
-- 2. THE WINDOW CHECK, WHICH IS A REAL DEFECT AND NOT A TIDY-UP
-- =============================================================================
--
-- Both tables carry `starts_at` and `ends_at` and NEITHER checks that the
-- second is after the first. The views filter
-- `starts_at <= now() AND ends_at >= now()`, so a row whose window is backwards
-- - which is one mis-typed `datetime-local` away, and the two fields sit next
-- to each other in a form - matches NOTHING, EVER. It is active, it is
-- scheduled, it is in the admin list looking correct, and it never appears.
-- There is no error and nothing to see. That is the most expensive kind of
-- silence, because the operator's next move is to check the schedule again.
--
-- Equal is refused as well as inverted: a zero-length window is the same
-- invisible row with a different typo behind it.
--
-- SAFE TO ADD TODAY BECAUSE BOTH TABLES ARE EMPTY. There is no row to
-- invalidate, which is exactly why this is worth doing now rather than after
-- somebody has scheduled a campaign.
--
-- =============================================================================
-- 3. `config` MUST BE AN OBJECT
-- =============================================================================
--
-- It is `jsonb NOT NULL DEFAULT '{}'` with no shape check, so `[1,2,3]` or the
-- bare string `"hello"` are both storable and both make every `config.x` read
-- undefined. The per-kind shape is validated in `lib/homepage/sections.ts` with
-- zod, because a CHECK that encodes four different object shapes is a CHECK
-- nobody will extend correctly. What belongs here is the one invariant that is
-- true for every kind and cheap to state.

BEGIN;

-- =============================================================================
-- homepage_sections
-- =============================================================================

ALTER TABLE public.homepage_sections
  DROP CONSTRAINT IF EXISTS homepage_sections_kind_check;

ALTER TABLE public.homepage_sections
  ADD CONSTRAINT homepage_sections_kind_check
  CHECK (kind IN (
    -- 127's seven, unchanged. `featured` and `city_deals` still have no
    -- component; they are kept rather than dropped because dropping a value
    -- from a CHECK is how a row somebody added last month stops being
    -- updatable.
    'hero', 'categories', 'benefits', 'deals', 'featured', 'city_deals', 'banner_row',
    -- [59]
    'product_rail', 'category_spotlight', 'supplier_spotlight', 'countdown'
  ));

ALTER TABLE public.homepage_sections
  DROP CONSTRAINT IF EXISTS homepage_sections_window_check;

ALTER TABLE public.homepage_sections
  ADD CONSTRAINT homepage_sections_window_check
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);

ALTER TABLE public.homepage_sections
  DROP CONSTRAINT IF EXISTS homepage_sections_config_object_check;

ALTER TABLE public.homepage_sections
  ADD CONSTRAINT homepage_sections_config_object_check
  CHECK (jsonb_typeof(config) = 'object');

-- =============================================================================
-- banners
-- =============================================================================

ALTER TABLE public.banners
  DROP CONSTRAINT IF EXISTS banners_window_check;

ALTER TABLE public.banners
  ADD CONSTRAINT banners_window_check
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);

-- =============================================================================
-- The two indexes the console's own queries need
-- =============================================================================
--
-- `homepage_sections_order_idx` from 127 is PARTIAL on `is_active`, so the
-- admin list - which shows inactive rows, that being the point of a toggle -
-- does not use it. Fourteen rows will never need an index and this is not
-- about rows: it is about the admin list and the live view disagreeing on which
-- index exists, which is the sort of thing that is invisible until a table is
-- big enough to matter and then is a mystery.

CREATE INDEX IF NOT EXISTS homepage_sections_position_all_idx
  ON public.homepage_sections (position, id);

CREATE INDEX IF NOT EXISTS banners_position_all_idx
  ON public.banners (placement, position, id);

COMMENT ON COLUMN public.homepage_sections.config IS
  'Per-kind settings, validated by lib/homepage/sections.ts. Object-shaped by CHECK; the keys are the application''s contract.';

COMMIT;
