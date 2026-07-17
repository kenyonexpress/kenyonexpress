-- Migration 030: Catalog, Search & SEO foundation (DRAFT, NOT applied)
-- Companion doc: docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
--
-- Prerequisites on the live DB (all already applied per STATE.md):
--   005/012/014 (products/categories/variants), 015 (coupon_deals),
--   016 (name_he/name_en/kenyon_price/full_price/sku), 018 (canonical slugs),
--   025 (audit_log_trigger_fn).
-- Independent of 026/027/028. products.platform_percent is added guardedly
-- (nullable, matching 027's variant); if 026/027 run before or after, every
-- statement here is a no-op or compatible.
--
-- Apply only via Supabase MCP apply_migration (never `db push`).
-- Idempotent: safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 0. Extensions + defensive set_updated_at
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. categories: taxonomy/collection split, SEO fields, depth guard
-- ---------------------------------------------------------------------------

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS name_en         text,
  ADD COLUMN IF NOT EXISTS kind            text NOT NULL DEFAULT 'taxonomy',
  ADD COLUMN IF NOT EXISTS rule            jsonb,
  ADD COLUMN IF NOT EXISTS seo_title       text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS og_image_url    text;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_kind_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_kind_check CHECK (kind IN ('taxonomy', 'collection'));

-- Smart collections: rule-driven, no manual product assignment.
-- The app layer translates rule keys (max_price, published_within_days,
-- min_discount_percent) into WHERE clauses.
UPDATE public.categories
  SET kind = 'collection',
      rule = COALESCE(rule, '{"min_discount_percent": 30}'::jsonb)
  WHERE slug = 'hot-deals' AND kind <> 'collection';

UPDATE public.categories
  SET kind = 'collection',
      rule = COALESCE(rule, '{"max_price": 99}'::jsonb)
  WHERE slug = 'under-99' AND kind <> 'collection';

UPDATE public.categories
  SET kind = 'collection',
      rule = COALESCE(rule, '{"published_within_days": 14}'::jsonb)
  WHERE slug = 'new' AND kind <> 'collection';

-- Max depth 2 (parent + child). Also blocks self-parenting and turning a
-- parent that already has children into a child.
CREATE OR REPLACE FUNCTION public.enforce_category_depth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'category cannot be its own parent';
    END IF;
    IF (SELECT c.parent_id FROM public.categories c WHERE c.id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'category depth is limited to 2 levels (parent % already has a parent)', NEW.parent_id;
    END IF;
    IF EXISTS (SELECT 1 FROM public.categories c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'category % has children and cannot become a child itself', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_depth_guard ON public.categories;
CREATE TRIGGER categories_depth_guard
  BEFORE INSERT OR UPDATE OF parent_id ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_category_depth();

-- ---------------------------------------------------------------------------
-- 2. products: brand, SEO fields, inventory threshold, variants meta,
--    price invariant, search vector
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand               text,
  ADD COLUMN IF NOT EXISTS search_keywords     text,
  ADD COLUMN IF NOT EXISTS seo_title           text,
  ADD COLUMN IF NOT EXISTS seo_description     text,
  ADD COLUMN IF NOT EXISTS low_stock_threshold int     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS has_variants        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant_axes        jsonb   NOT NULL DEFAULT '[]'::jsonb,
  -- Matches 027's nullable variant. 026's NOT NULL DEFAULT 10 variant is also
  -- compatible: whichever runs first wins, the other is a no-op.
  ADD COLUMN IF NOT EXISTS platform_percent    numeric(5,2);

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_platform_percent_range
    CHECK (platform_percent IS NULL OR platform_percent BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Price invariant: full_price is the market reference price and must not be
-- below the selling price. Normalize violators before adding the CHECK.
UPDATE public.products
  SET full_price = NULL
  WHERE full_price IS NOT NULL
    AND kenyon_price IS NOT NULL
    AND full_price < kenyon_price;

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_full_price_gte_kenyon
    CHECK (full_price IS NULL OR kenyon_price IS NULL OR full_price >= kenyon_price);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_low_stock_threshold_positive
    CHECK (low_stock_threshold >= 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Search vector: generated, weighted. 'simple' config (no Hebrew stemmer
-- exists in Postgres); query-side expansion happens in he_tsquery().
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce(name_he, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig,
         coalesce(name_en, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(sku, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(search_keywords, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(description_he, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS products_search_vector_idx
  ON public.products USING gin (search_vector);
CREATE INDEX IF NOT EXISTS products_name_he_trgm_idx
  ON public.products USING gin (name_he gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_attributes_idx
  ON public.products USING gin (attributes jsonb_path_ops);
CREATE INDEX IF NOT EXISTS products_active_price_idx
  ON public.products (kenyon_price)
  WHERE status = 'active'::public.product_status AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_brand_idx
  ON public.products (brand) WHERE brand IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. product_variants: structured option values
-- ---------------------------------------------------------------------------

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS option_values jsonb NOT NULL DEFAULT '{}'::jsonb;

-- One variant per option combination per product. Scoped to non-empty
-- option_values: legacy variants keep the '{}' default until backfilled,
-- and two legacy variants of one product must not fail the index build.
CREATE UNIQUE INDEX IF NOT EXISTS variants_product_option_values_uniq
  ON public.product_variants (product_id, option_values)
  WHERE deleted_at IS NULL AND option_values <> '{}'::jsonb;

COMMENT ON COLUMN public.product_variants.price_modifier IS
  'DEPRECATED: price resolution is variant.price, else product.kenyon_price. Not read by new code; drop in a future cleanup migration.';

UPDATE public.products p
  SET has_variants = true
  WHERE p.has_variants = false
    AND EXISTS (
      SELECT 1 FROM public.product_variants v
      WHERE v.product_id = p.id AND v.deleted_at IS NULL
    );

-- ---------------------------------------------------------------------------
-- 4. product_categories: secondary manual placement
--    (products.category_id stays the primary category: breadcrumb + canonical)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_categories (
  product_id  uuid NOT NULL REFERENCES public.products(id)   ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS product_categories_category_idx
  ON public.product_categories (category_id, sort_order);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_categories: public read" ON public.product_categories;
CREATE POLICY "product_categories: public read"
  ON public.product_categories FOR SELECT
  USING (
    product_id IN (
      SELECT id FROM public.products
      WHERE status = 'active'::public.product_status AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "product_categories: admin all" ON public.product_categories;
CREATE POLICY "product_categories: admin all"
  ON public.product_categories FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Attribute/filter system: definitions in tables, values stay in
--    products.attributes (jsonb)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.attribute_definitions (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text    UNIQUE NOT NULL CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  name_he       text    NOT NULL,
  value_type    text    NOT NULL DEFAULT 'text'
                  CHECK (value_type IN ('text', 'number', 'boolean', 'enum')),
  unit          text,
  enum_values   jsonb,  -- for value_type='enum': [{"value":"samsung","label_he":"סמסונג"}]
  is_filterable boolean NOT NULL DEFAULT false,
  is_searchable boolean NOT NULL DEFAULT false,
  sort_order    int     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.attribute_definitions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.attribute_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attribute_definitions: public read" ON public.attribute_definitions;
CREATE POLICY "attribute_definitions: public read"
  ON public.attribute_definitions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "attribute_definitions: admin all" ON public.attribute_definitions;
CREATE POLICY "attribute_definitions: admin all"
  ON public.attribute_definitions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS audit_attribute_definitions ON public.attribute_definitions;
CREATE TRIGGER audit_attribute_definitions
  AFTER INSERT OR UPDATE OR DELETE ON public.attribute_definitions
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

CREATE TABLE IF NOT EXISTS public.category_attributes (
  category_id  uuid NOT NULL REFERENCES public.categories(id)            ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES public.attribute_definitions(id) ON DELETE CASCADE,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, attribute_id)
);

ALTER TABLE public.category_attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_attributes: public read" ON public.category_attributes;
CREATE POLICY "category_attributes: public read"
  ON public.category_attributes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "category_attributes: admin all" ON public.category_attributes;
CREATE POLICY "category_attributes: admin all"
  ON public.category_attributes FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. coupon_deals: slug (for /coupons/[slug]), SEO fields, search vector
-- ---------------------------------------------------------------------------

ALTER TABLE public.coupon_deals
  ADD COLUMN IF NOT EXISTS slug            text,
  ADD COLUMN IF NOT EXISTS seo_title       text,
  ADD COLUMN IF NOT EXISTS seo_description text;

DO $$ BEGIN
  ALTER TABLE public.coupon_deals
    ADD CONSTRAINT coupon_deals_slug_format
    CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS coupon_deals_slug_uniq
  ON public.coupon_deals (slug) WHERE slug IS NOT NULL;

ALTER TABLE public.coupon_deals
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce(title_he, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(business_name, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(location_he, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS coupon_deals_search_vector_idx
  ON public.coupon_deals USING gin (search_vector);
CREATE INDEX IF NOT EXISTS coupon_deals_title_trgm_idx
  ON public.coupon_deals USING gin (title_he gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 7. search_synonyms: admin-managed query expansion dictionary
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.search_synonyms (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  term       text    UNIQUE NOT NULL,
  synonyms   text[]  NOT NULL DEFAULT '{}',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.search_synonyms;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.search_synonyms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.search_synonyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_synonyms: public read active" ON public.search_synonyms;
CREATE POLICY "search_synonyms: public read active"
  ON public.search_synonyms FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "search_synonyms: admin all" ON public.search_synonyms;
CREATE POLICY "search_synonyms: admin all"
  ON public.search_synonyms FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS audit_search_synonyms ON public.search_synonyms;
CREATE TRIGGER audit_search_synonyms
  AFTER INSERT OR UPDATE OR DELETE ON public.search_synonyms
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
-- 8. search_queries: append-only log feeding the zero-results report
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.search_queries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query         text NOT NULL,
  results_count int  NOT NULL DEFAULT 0,
  source        text NOT NULL DEFAULT 'search'
                  CHECK (source IN ('search', 'autocomplete', 'zero_fallback')),
  session_id    text,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  took_ms       int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_queries_created_idx
  ON public.search_queries (created_at DESC);
CREATE INDEX IF NOT EXISTS search_queries_zero_results_idx
  ON public.search_queries (created_at DESC) WHERE results_count = 0;

-- RLS: admin SELECT only. No INSERT policy on purpose: the only writer is
-- log_search_query() (SECURITY DEFINER), called from server code.
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_queries: admin read" ON public.search_queries;
CREATE POLICY "search_queries: admin read"
  ON public.search_queries FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_search_query(
  p_query         text,
  p_results_count int,
  p_source        text DEFAULT 'search',
  p_session_id    text DEFAULT NULL,
  p_took_ms       int  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF btrim(coalesce(p_query, '')) = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.search_queries (query, results_count, source, session_id, user_id, took_ms)
  VALUES (
    left(btrim(p_query), 200),
    greatest(coalesce(p_results_count, 0), 0),
    CASE WHEN p_source IN ('search', 'autocomplete', 'zero_fallback') THEN p_source ELSE 'search' END,
    left(p_session_id, 64),
    auth.uid(),
    p_took_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_search_query(text, int, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_search_query(text, int, text, text, int)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. seo_redirects: WordPress continuity + automatic slug-change 301s
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.seo_redirects (
  id          uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  old_path    text   UNIQUE NOT NULL CHECK (old_path ~ '^/'),
  -- for status_code 410 the convention is new_path = '/' (unused)
  new_path    text   NOT NULL CHECK (new_path ~ '^/'),
  status_code int    NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302, 307, 308, 410)),
  source      text   NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'wordpress_import', 'slug_change')),
  hits        bigint NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_redirects_no_self CHECK (old_path <> new_path)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.seo_redirects;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.seo_redirects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.seo_redirects ENABLE ROW LEVEL SECURITY;

-- proxy.ts / not-found flow does the lookup with the anon client; paths are not secrets.
DROP POLICY IF EXISTS "seo_redirects: public read" ON public.seo_redirects;
CREATE POLICY "seo_redirects: public read"
  ON public.seo_redirects FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "seo_redirects: admin all" ON public.seo_redirects;
CREATE POLICY "seo_redirects: admin all"
  ON public.seo_redirects FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Hit counter for the middleware (anon cannot UPDATE directly).
CREATE OR REPLACE FUNCTION public.touch_seo_redirect(p_old_path text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.seo_redirects
    SET hits = hits + 1, last_hit_at = now()
    WHERE old_path = p_old_path;
$$;

REVOKE ALL ON FUNCTION public.touch_seo_redirect(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_seo_redirect(text)
  TO anon, authenticated, service_role;

-- Automatic 301 on slug rename. SECURITY DEFINER so a content_uploader
-- renaming their own product can still write the redirect row.
-- Collapses chains (A->B then B->C becomes A->C) and never leaves a
-- self-redirect when a slug is renamed back.
CREATE OR REPLACE FUNCTION public.record_slug_redirect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text := TG_ARGV[0];
BEGIN
  IF OLD.slug IS NOT NULL AND NEW.slug IS NOT NULL
     AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    -- the new path is live again: no redirect may originate from it
    DELETE FROM public.seo_redirects WHERE old_path = v_prefix || NEW.slug;

    INSERT INTO public.seo_redirects (old_path, new_path, status_code, source)
    VALUES (v_prefix || OLD.slug, v_prefix || NEW.slug, 301, 'slug_change')
    ON CONFLICT (old_path) DO UPDATE
      SET new_path = EXCLUDED.new_path, status_code = 301, updated_at = now();

    -- collapse chains: everything that pointed at the old path follows it
    UPDATE public.seo_redirects
      SET new_path = v_prefix || NEW.slug, updated_at = now()
      WHERE new_path = v_prefix || OLD.slug
        AND old_path <> v_prefix || NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_slug_redirect ON public.products;
CREATE TRIGGER products_slug_redirect
  AFTER UPDATE OF slug ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.record_slug_redirect('/products/');

DROP TRIGGER IF EXISTS categories_slug_redirect ON public.categories;
CREATE TRIGGER categories_slug_redirect
  AFTER UPDATE OF slug ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.record_slug_redirect('/category/');

DROP TRIGGER IF EXISTS coupon_deals_slug_redirect ON public.coupon_deals;
CREATE TRIGGER coupon_deals_slug_redirect
  AFTER UPDATE OF slug ON public.coupon_deals
  FOR EACH ROW EXECUTE FUNCTION public.record_slug_redirect('/coupons/');

-- ---------------------------------------------------------------------------
-- 10. Hebrew query expansion: he_tsquery()
-- ---------------------------------------------------------------------------

-- Turns free text into a tsquery with poor-man's Hebrew stemming:
-- per token: the token itself (prefix match), de-prefixed variants
-- (single ו/ה/ב/כ/ל/מ/ש and common two-letter combos), plus synonyms
-- from search_synonyms. Variants are OR'ed, tokens AND'ed.
CREATE OR REPLACE FUNCTION public.he_tsquery(p_query text)
RETURNS tsquery
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tokens   text[];
  v_tok      text;
  v_variants text[];
  v_syns     text[];
  v_parts    text[] := ARRAY[]::text[];
BEGIN
  v_tokens := regexp_split_to_array(
    btrim(regexp_replace(lower(coalesce(p_query, '')), '[^0-9a-zא-ת]+', ' ', 'g')),
    '\s+'
  );
  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL
     OR (array_length(v_tokens, 1) = 1 AND v_tokens[1] = '') THEN
    RETURN ''::tsquery;
  END IF;

  FOREACH v_tok IN ARRAY v_tokens LOOP
    CONTINUE WHEN v_tok = '';
    v_variants := ARRAY[v_tok];

    IF length(v_tok) >= 4
       AND left(v_tok, 1) = ANY (ARRAY['ו','ה','ב','כ','ל','מ','ש']) THEN
      v_variants := v_variants || substr(v_tok, 2);
    END IF;

    IF length(v_tok) >= 5
       AND left(v_tok, 2) = ANY (ARRAY['וה','וב','ול','וכ','ומ','וש','שה','לה','בה','מה','כש']) THEN
      v_variants := v_variants || substr(v_tok, 3);
    END IF;

    SELECT array_agg(DISTINCT s) INTO v_syns
    FROM public.search_synonyms ss, unnest(ss.synonyms) AS s
    WHERE ss.is_active AND ss.term = v_tok
      AND s ~ '^[0-9a-zא-ת]+$';
    IF v_syns IS NOT NULL THEN
      v_variants := v_variants || v_syns;
    END IF;

    SELECT array_agg(DISTINCT v) INTO v_variants
    FROM unnest(v_variants) AS v
    WHERE v IS NOT NULL AND v <> '';

    v_parts := v_parts ||
      ('(' || (SELECT string_agg(v || ':*', ' | ') FROM unnest(v_variants) AS v) || ')');
  END LOOP;

  IF array_length(v_parts, 1) IS NULL THEN
    RETURN ''::tsquery;
  END IF;

  RETURN to_tsquery('simple', array_to_string(v_parts, ' & '));
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. search_products(): FTS + trigram fallback + business-aware ranking
-- ---------------------------------------------------------------------------

-- score = 0.55*lexical + 0.15*fuzzy + 0.15*freshness(30d decay)
--       + 0.10*margin(platform_percent) + 0.05*featured
-- SECURITY INVOKER on purpose: results are filtered by the caller's RLS
-- (public read = active products only).
CREATE OR REPLACE FUNCTION public.search_products(
  p_query       text,
  p_category_id uuid DEFAULT NULL,
  p_limit       int  DEFAULT 24,
  p_offset      int  DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  slug         text,
  name_he      text,
  kenyon_price numeric,
  full_price   numeric,
  images       jsonb,
  score        real,
  match_type   text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_q   tsquery;
  v_lim int := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_off int := greatest(coalesce(p_offset, 0), 0);
BEGIN
  v_q := public.he_tsquery(p_query);

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.slug, p.name_he, p.kenyon_price, p.full_price, p.images,
           p.search_vector, p.published_at, p.created_at, p.is_featured,
           p.platform_percent
    FROM public.products p
    WHERE p.status = 'active'::public.product_status
      AND p.deleted_at IS NULL
      AND (
        p_category_id IS NULL
        OR p.category_id = p_category_id
        OR EXISTS (
          SELECT 1 FROM public.product_categories pc
          WHERE pc.product_id = p.id AND pc.category_id = p_category_id
        )
      )
  ),
  fts AS (
    SELECT b.*, ts_rank_cd(b.search_vector, v_q, 32)::real AS lex
    FROM base b
    WHERE v_q <> ''::tsquery AND b.search_vector @@ v_q
  ),
  fuzzy AS (
    -- typo fallback, only when FTS came back nearly empty
    SELECT b.*, word_similarity(p_query, b.name_he)::real AS sim
    FROM base b
    WHERE (SELECT count(*) FROM fts) < 3
      AND word_similarity(p_query, b.name_he) > 0.35
      AND NOT EXISTS (SELECT 1 FROM fts f WHERE f.id = b.id)
  ),
  united AS (
    SELECT f.id, f.slug, f.name_he, f.kenyon_price, f.full_price, f.images,
           f.published_at, f.created_at, f.is_featured, f.platform_percent,
           f.lex, 0::real AS sim, 'fts'::text AS mt
    FROM fts f
    UNION ALL
    SELECT z.id, z.slug, z.name_he, z.kenyon_price, z.full_price, z.images,
           z.published_at, z.created_at, z.is_featured, z.platform_percent,
           0::real, z.sim, 'fuzzy'::text
    FROM fuzzy z
  ),
  scored AS (
    SELECT u.id, u.slug, u.name_he, u.kenyon_price, u.full_price, u.images,
           (0.55 * u.lex
            + 0.15 * u.sim
            + 0.15 * exp(-extract(epoch FROM (now() - coalesce(u.published_at, u.created_at))) / (30 * 86400.0))
            + 0.10 * coalesce(u.platform_percent, 10) / 100.0
            + 0.05 * (u.is_featured)::int
           )::real AS rank_score,
           u.mt,
           coalesce(u.published_at, u.created_at) AS recency
    FROM united u
  )
  SELECT s.id, s.slug, s.name_he, s.kenyon_price, s.full_price, s.images,
         s.rank_score, s.mt
  FROM scored s
  ORDER BY s.rank_score DESC, s.recency DESC
  LIMIT v_lim OFFSET v_off;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. autocomplete_products(): word-prefix suggestions, categories first
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.autocomplete_products(
  p_prefix text,
  p_limit  int DEFAULT 8
)
RETURNS TABLE (
  kind         text,
  id           uuid,
  slug         text,
  label_he     text,
  kenyon_price numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_p   text := btrim(coalesce(p_prefix, ''));
  v_lim int  := least(greatest(coalesce(p_limit, 8), 1), 20);
BEGIN
  IF length(v_p) < 2 THEN
    RETURN;
  END IF;
  v_p := replace(replace(v_p, '%', ''), '_', '');

  RETURN QUERY
  (
    SELECT 'category'::text, c.id, c.slug, c.name_he, NULL::numeric
    FROM public.categories c
    WHERE c.is_active = true AND c.deleted_at IS NULL
      AND c.name_he ILIKE v_p || '%'
    ORDER BY c.sort_order
    LIMIT 2
  )
  UNION ALL
  (
    SELECT 'product'::text, p.id, p.slug, p.name_he, p.kenyon_price
    FROM public.products p
    WHERE p.status = 'active'::public.product_status
      AND p.deleted_at IS NULL
      AND (p.name_he ILIKE v_p || '%' OR p.name_he ILIKE '% ' || v_p || '%')
    ORDER BY p.is_featured DESC, coalesce(p.published_at, p.created_at) DESC
    LIMIT v_lim
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. category_facets(): value + count per filterable attribute of a category
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.category_facets(p_category_id uuid)
RETURNS TABLE (
  attr_key      text,
  attr_name_he  text,
  value         text,
  product_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ad.key, ad.name_he, p.attributes ->> ad.key, count(*)::bigint
  FROM public.category_attributes ca
  JOIN public.attribute_definitions ad
    ON ad.id = ca.attribute_id AND ad.is_filterable = true
  JOIN public.products p
    ON p.status = 'active'::public.product_status
   AND p.deleted_at IS NULL
   AND (
     p.category_id = p_category_id
     OR EXISTS (
       SELECT 1 FROM public.product_categories pc
       WHERE pc.product_id = p.id AND pc.category_id = p_category_id
     )
   )
   AND p.attributes ? ad.key
  WHERE ca.category_id = p_category_id
  GROUP BY 1, 2, 3
  ORDER BY 1, 4 DESC;
$$;
