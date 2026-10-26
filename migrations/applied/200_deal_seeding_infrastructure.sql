-- 200: Deal seeding infrastructure
--
-- Establishes tables, functions, and RLS policies for continuous deal scraping
-- from approved sources, with deduplication, image validation, and approval workflow.
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- TABLES CREATED:
--   - pending_deals: Deals awaiting approval from scrapers
--   - deal_sources: Approved scraping sources and their rules
--   - deal_duplicates: Deduplication tracking (source hash → canonical deal)
--   - deal_validations: Image validation results and health checks
--
-- WHAT THIS ENABLES:
--   1. Continuous scraping from approved sources (live site, vendor APIs)
--   2. Automatic deduplication via content hash
--   3. Image validation before approval
--   4. Bulk approval workflow (batch → products table)
--   5. Audit trail of all deals processed
--
-- ============================================================================
-- DEAL SOURCES TABLE: approved scraping sources (moved before pending_deals for FK)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  url text NOT NULL,
  description text,
  scraper_type text NOT NULL CHECK (scraper_type IN ('http', 'api', 'static', 'webhook')),
  scraper_config jsonb NOT NULL DEFAULT '{}',
  last_scraped_at timestamp with time zone,
  scrape_interval_minutes integer DEFAULT 1440,
  rate_limit_per_hour integer DEFAULT 100,
  min_price_agorot integer DEFAULT 0,
  max_price_agorot integer,
  allowed_categories text[] DEFAULT '{}',
  require_image boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================================
-- PENDING DEALS TABLE: scraped content awaiting review
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pending_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Deal metadata from scraper
  source_id uuid NOT NULL REFERENCES public.deal_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,

  -- Canonicalized for comparison (dedupe)
  content_hash text NOT NULL,

  -- Product data (structure matches products table)
  name_he text NOT NULL,
  name_en text,
  slug text,
  description_he text,
  description_en text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,

  -- Pricing (in agorot)
  price_agorot integer NOT NULL CHECK (price_agorot >= 0),
  full_price_agorot integer,

  -- Inventory
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),

  -- Media
  image_url text,
  image_hash text,
  image_validation_status text DEFAULT 'pending' CHECK (
    image_validation_status IN ('pending', 'valid', 'failed', 'skipped')
  ),
  image_validation_error text,

  -- Product metadata
  product_type text DEFAULT 'physical' CHECK (product_type IN ('physical', 'coupon', 'other')),
  sku text UNIQUE,

  -- Approval workflow
  approval_status text NOT NULL DEFAULT 'pending' CHECK (
    approval_status IN ('pending', 'approved', 'rejected', 'duplicate')
  ),
  approval_reason text,
  approval_timestamp timestamp with time zone,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Audit trail
  scraped_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}' -- raw scraper output for debugging
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS pending_deals_source_id_idx
  ON public.pending_deals(source_id);
CREATE INDEX IF NOT EXISTS pending_deals_content_hash_idx
  ON public.pending_deals(content_hash);
CREATE INDEX IF NOT EXISTS pending_deals_approval_status_idx
  ON public.pending_deals(approval_status)
  WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS pending_deals_image_validation_idx
  ON public.pending_deals(image_validation_status);
CREATE INDEX IF NOT EXISTS pending_deals_category_id_idx
  ON public.pending_deals(category_id);
CREATE INDEX IF NOT EXISTS pending_deals_scraped_at_idx
  ON public.pending_deals(scraped_at DESC);

-- NOTE: deal_sources table definition moved earlier in file (before pending_deals)
-- to satisfy foreign key dependency. See line ~25.

-- ============================================================================
-- DEAL DUPLICATES TABLE: deduplication tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deal_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which deals are duplicates
  pending_deal_id uuid NOT NULL REFERENCES public.pending_deals(id) ON DELETE CASCADE,
  duplicate_of_id uuid NOT NULL REFERENCES public.pending_deals(id) ON DELETE CASCADE,

  -- Why they're duplicates
  duplicate_reason text CHECK (duplicate_reason IN (
    'exact_match',
    'similar_price_and_name',
    'product_already_exists'
  )),
  confidence_score numeric(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Audit
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  detection_method text DEFAULT 'hash'
);

CREATE INDEX IF NOT EXISTS deal_duplicates_pending_deal_idx
  ON public.deal_duplicates(pending_deal_id);
CREATE INDEX IF NOT EXISTS deal_duplicates_duplicate_of_idx
  ON public.deal_duplicates(duplicate_of_id);

-- ============================================================================
-- DEAL VALIDATIONS TABLE: image and content health checks
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deal_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  pending_deal_id uuid NOT NULL REFERENCES public.pending_deals(id) ON DELETE CASCADE,

  -- Image validation
  image_url text,
  image_reachable boolean,
  image_content_type text,
  image_size_bytes integer,
  image_dimensions text, -- "1024x768"
  image_error text,

  -- Content validation
  name_quality_score numeric(3, 2), -- Hebrew quality, length, etc
  description_quality_score numeric(3, 2),
  price_reasonable boolean, -- not suspiciously low
  category_matches boolean, -- image/name align with category

  -- Overall status
  overall_status text NOT NULL DEFAULT 'pending' CHECK (
    overall_status IN ('pending', 'passed', 'failed', 'warning')
  ),
  overall_error_message text,

  -- Audit
  validated_at timestamp with time zone NOT NULL DEFAULT now(),
  validation_method text DEFAULT 'automated',
  manual_review_notes text
);

CREATE INDEX IF NOT EXISTS deal_validations_pending_deal_idx
  ON public.deal_validations(pending_deal_id);
CREATE INDEX IF NOT EXISTS deal_validations_overall_status_idx
  ON public.deal_validations(overall_status);

-- ============================================================================
-- RLS POLICIES: Service role only for scrapers, admins manage approvals
-- ============================================================================

ALTER TABLE public.pending_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_duplicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_validations ENABLE ROW LEVEL SECURITY;

-- Service role (scrapers) can insert and update deals
CREATE POLICY pending_deals_service_role
  ON public.pending_deals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY deal_sources_service_role
  ON public.deal_sources
  FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY deal_duplicates_service_role
  ON public.deal_duplicates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY deal_validations_service_role
  ON public.deal_validations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can read and approve deals
CREATE POLICY pending_deals_admin_read
  ON public.pending_deals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
        AND is_super_admin = true
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Compute content hash for deduplication
CREATE OR REPLACE FUNCTION compute_deal_hash(
  p_name_he text,
  p_price_agorot integer,
  p_supplier_id uuid
) RETURNS text AS $$
BEGIN
  RETURN encode(
    digest(
      p_name_he || '::' || p_price_agorot || '::' || COALESCE(p_supplier_id::text, ''),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Check if a deal hash already exists (deduplication)
CREATE OR REPLACE FUNCTION check_deal_duplicate(
  p_content_hash text,
  p_source_id uuid
) RETURNS uuid AS $$
DECLARE
  v_duplicate_id uuid;
BEGIN
  SELECT id INTO v_duplicate_id
    FROM public.pending_deals
   WHERE content_hash = p_content_hash
     AND source_id = p_source_id
     AND approval_status != 'rejected'
   LIMIT 1;

  RETURN v_duplicate_id;
END;
$$ LANGUAGE plpgsql;

-- Approve a batch of deals and promote to products table
CREATE OR REPLACE FUNCTION approve_pending_deals(
  p_deal_ids uuid[],
  p_reviewed_by uuid
) RETURNS TABLE(
  deal_id uuid,
  product_id uuid,
  status text
) AS $$
DECLARE
  v_deal_id uuid;
  v_product_id uuid;
  v_category_id uuid;
  v_supplier_id uuid;
  v_approval_count integer := 0;
BEGIN
  FOREACH v_deal_id IN ARRAY p_deal_ids
  LOOP
    -- Verify deal is approvable
    SELECT pd.supplier_id, pd.category_id INTO v_supplier_id, v_category_id
      FROM public.pending_deals pd
     WHERE pd.id = v_deal_id
       AND pd.approval_status = 'pending'
       AND pd.image_validation_status = 'valid';

    IF NOT FOUND THEN
      RETURN QUERY SELECT v_deal_id, NULL::uuid, 'error: not ready for approval'::text;
      CONTINUE;
    END IF;

    -- Create product row
    INSERT INTO public.products (
      name_he, name_en, slug, description_he, description_en,
      category_id, supplier_id, kenyon_price, full_price,
      stock_quantity, image_url, type, status, approval_status
    )
    SELECT
      pd.name_he, pd.name_en, pd.slug, pd.description_he, pd.description_en,
      pd.category_id, pd.supplier_id, pd.price_agorot, pd.full_price_agorot,
      pd.stock_quantity, pd.image_url, pd.product_type, 'active', 'approved'
      FROM public.pending_deals pd
     WHERE pd.id = v_deal_id
    RETURNING products.id INTO v_product_id;

    -- Mark deal approved
    UPDATE public.pending_deals
       SET approval_status = 'approved',
           approval_timestamp = now(),
           reviewed_by = p_reviewed_by
     WHERE id = v_deal_id;

    RETURN QUERY SELECT v_deal_id, v_product_id, 'approved'::text;
    v_approval_count := v_approval_count + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERMISSIONS: Grant service role access to new tables
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_deals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_duplicates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_validations TO service_role;
GRANT SELECT ON public.deal_sources TO service_role;

GRANT SELECT ON public.pending_deals TO authenticated;
GRANT SELECT ON public.deal_sources TO authenticated;
GRANT SELECT ON public.deal_validations TO authenticated;

-- ============================================================================
-- ROLLBACK
-- ============================================================================

-- DROP POLICY IF EXISTS pending_deals_service_role ON public.pending_deals;
-- DROP POLICY IF EXISTS pending_deals_admin_read ON public.pending_deals;
-- DROP POLICY IF EXISTS deal_sources_service_role ON public.deal_sources;
-- DROP POLICY IF EXISTS deal_duplicates_service_role ON public.deal_duplicates;
-- DROP POLICY IF EXISTS deal_validations_service_role ON public.deal_validations;
-- DROP FUNCTION IF EXISTS approve_pending_deals(uuid[], uuid);
-- DROP FUNCTION IF EXISTS check_deal_duplicate(text, uuid);
-- DROP FUNCTION IF EXISTS compute_deal_hash(text, integer, uuid);
-- DROP TABLE IF EXISTS public.deal_validations;
-- DROP TABLE IF EXISTS public.deal_duplicates;
-- DROP TABLE IF EXISTS public.pending_deals;
-- DROP TABLE IF EXISTS public.deal_sources;
