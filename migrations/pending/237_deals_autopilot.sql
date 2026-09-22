-- 237_deals_autopilot.sql
--
-- Section 96 (DEALS-AUTOPILOT, docs/DEALS-PIPELINE.md): a supplier-fed deals
-- ingestion queue. NOT a scraper. The pipeline never reaches a competitor's
-- site: a supplier who wants to be considered configures a feed URL for
-- their OWN listings (their own domain, their own data, opt-in), or submits
-- one deal by hand. Either way the row lands here as 'pending_review' and
-- goes no further without an admin. See docs/DEALS-PIPELINE.md for why the
-- literal "scrape Israeli deal sites" reading of the original brief was
-- refused.
--
-- WHY THIS IS A STAGING TABLE AND NOT A DIRECT WRITE TO public.products.
-- A feed can supply name, price, discount, link, category (as free text) and
-- an image; it cannot supply platform_percent, which
-- docs/BUSINESS-RULES.md §4.1 requires with NO DEFAULT ANYWHERE, and
-- `enforce_product_approval` (052) will not let a row publish without it
-- either. A commission rate is a business decision, not a supplier's to set
-- for themselves. So a fetched or submitted candidate can only ever reach
-- 'pending_review' automatically; 'approved' is a human decision recorded
-- against a specific admin, and turning an approved candidate into a real
-- product remains an explicit next action, not something this migration or
-- the cron route that feeds it performs on its own.
--
-- IDEMPOTENT: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DO-block enum /
-- DROP POLICY IF EXISTS before every CREATE POLICY.

BEGIN;

-- 1. Per-supplier opt-in feed configuration. NULL feed_url = no automated
-- fetch for that supplier; the manual submission form still works regardless.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS feed_url text,
  ADD COLUMN IF NOT EXISTS feed_format text;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_feed_format_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_feed_format_check
  CHECK (feed_format IS NULL OR feed_format IN ('json', 'csv'));

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_feed_url_https;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_feed_url_https
  CHECK (feed_url IS NULL OR feed_url ~ '^https://');

COMMENT ON COLUMN public.suppliers.feed_url IS
  'Opt-in JSON/CSV feed of the SUPPLIER''S OWN deals, fetched every 6h behind DEALS_AUTOPILOT. NULL = no automated fetch. Never a third-party site (237, docs/DEALS-PIPELINE.md).';

-- 2. The candidate status lifecycle.
DO $$ BEGIN
  CREATE TYPE public.deal_candidate_status AS ENUM ('pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.deal_candidate_source AS ENUM ('feed', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. The queue itself.
CREATE TABLE IF NOT EXISTS public.deal_candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  source           public.deal_candidate_source NOT NULL,
  -- The feed's own identifier for this deal, so a re-fetch updates the same
  -- row instead of duplicating it. A manual submission has none; the app
  -- generates a stable one (see docs/DEALS-PIPELINE.md) so the unique
  -- constraint below still means something for it.
  external_ref     text NOT NULL,
  name_he          text NOT NULL CHECK (length(trim(name_he)) > 0),
  -- Integer agorot, same rule as everywhere else in this codebase. The feed
  -- sends a decimal ILS number; the parser converts it before this row is
  -- ever written, so nothing downstream of this table ever sees a float.
  price_agorot     bigint NOT NULL CHECK (price_agorot > 0),
  full_price_agorot bigint CHECK (full_price_agorot IS NULL OR full_price_agorot > price_agorot),
  discount_percent smallint CHECK (discount_percent IS NULL OR (discount_percent BETWEEN 0 AND 100)),
  -- Free text as the feed sent it. Mapping this to a real public.categories
  -- row is an admin decision at review time, not something a feed dictates
  -- (a feed's "מסעדות" is not guaranteed to be this catalogue's category
  -- name or hierarchy).
  category_text    text,
  link_url         text NOT NULL CHECK (link_url ~ '^https://'),
  image_url        text CHECK (image_url IS NULL OR image_url ~ '^https://'),
  raw_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           public.deal_candidate_status NOT NULL DEFAULT 'pending_review',
  rejection_reason text,
  reviewed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_candidates_supplier_ref_unique UNIQUE (supplier_id, external_ref)
);

COMMENT ON TABLE public.deal_candidates IS
  'Supplier-fed (feed or manual) deal submissions pending admin review. Never a scraped third-party listing. 237, docs/DEALS-PIPELINE.md.';

CREATE INDEX IF NOT EXISTS idx_deal_candidates_pending
  ON public.deal_candidates (fetched_at)
  WHERE status = 'pending_review';

CREATE INDEX IF NOT EXISTS idx_deal_candidates_supplier
  ON public.deal_candidates (supplier_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.deal_candidates;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.deal_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS. A supplier reads and inserts (manual submission) only their own
-- rows; nobody but service role updates status -- approval is an admin
-- decision, not a supplier self-service action, same principle as
-- enforce_product_approval (052).
ALTER TABLE public.deal_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deal_candidates FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.deal_candidates TO authenticated;

DROP POLICY IF EXISTS deal_candidates_supplier_select ON public.deal_candidates;
CREATE POLICY deal_candidates_supplier_select ON public.deal_candidates
  FOR SELECT TO authenticated
  USING (
    supplier_id IN (
      SELECT supplier_id FROM public.supplier_members
      WHERE user_id = (SELECT auth.uid()) AND is_active
    )
  );

DROP POLICY IF EXISTS deal_candidates_supplier_manual_insert ON public.deal_candidates;
CREATE POLICY deal_candidates_supplier_manual_insert ON public.deal_candidates
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'manual'::public.deal_candidate_source
    AND status = 'pending_review'::public.deal_candidate_status
    AND supplier_id IN (
      SELECT supplier_id FROM public.supplier_members
      WHERE user_id = (SELECT auth.uid()) AND is_active
    )
  );

COMMIT;
