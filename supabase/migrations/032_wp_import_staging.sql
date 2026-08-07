-- Migration 032: WordPress/WooCommerce import staging
-- Companion doc: docs/ARCHITECTURE-WP-DATA-MIGRATION.md
--
-- APPLIED to the hosted project 2026-07-27 via MCP apply_migration. The header
-- previously read "DRAFT, DO NOT APPLY", which contradicted line 22 of this
-- same file telling you how to apply it, and contradicted the fact that it had
-- been applied locally since 2026-07-24. The draft label was stale, not a
-- standing instruction. See docs/PRODUCTION-CHANGES-2026-07-27.md section 9.
--
-- Staging + permanent archive for the kenyonexpress.co.il WooCommerce data.
-- Creates ONLY the wp_import schema. Touches nothing in public.
-- Independent of 026-031: safe to apply at any point in the chain.
--
-- Access model:
--   * wp_import is NOT in the PostgREST exposed-schemas list, so it is
--     unreachable from supabase-js clients regardless of grants.
--   * Writers: service_role only (import scripts, bypasses RLS).
--   * Readers: admins via MCP execute_sql / SQL editor. RLS admin-select
--     policies exist as defense in depth in case the schema is ever exposed.
--
-- Design notes:
--   * Natural WordPress keys (bigint wp ids) are the primary keys here,
--     deviating from the uuid-PK house rule on purpose: they are the
--     idempotency anchors of the whole import.
--   * Every table keeps a raw jsonb column: full source fidelity
--     (zero data loss) even for fields no target column exists for.
--
-- Apply only via Supabase MCP apply_migration (never `db push`).
-- Idempotent: safe to run multiple times.

-- Defensive: 001 may have stopped early on a live DB before defining this.
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
-- 0. Schema + grants
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS wp_import;

COMMENT ON SCHEMA wp_import IS
  'WooCommerce staging + permanent legacy archive (kenyonexpress.co.il). Loaded by scripts/wp-import/*; never exposed to PostgREST.';

REVOKE ALL ON SCHEMA wp_import FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA wp_import TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA wp_import TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wp_import
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wp_import
  GRANT ALL ON SEQUENCES TO service_role;

-- ---------------------------------------------------------------------------
-- 1. import_batches: one row per loader/projection run
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.import_batches (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text        NOT NULL CHECK (kind IN
                  ('staging_load', 'media_sync', 'curation_import',
                   'project_catalog', 'project_customers', 'project_vouchers',
                   'project_redirects', 'verify', 'purge')),
  source_name   text,                 -- dump file name / curation file name
  source_sha256 text,                 -- checksum of the dump this run consumed
  wp_site_url   text,
  dry_run       boolean     NOT NULL DEFAULT false,
  stats         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  notes         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.import_batches;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. id_map: the idempotency backbone (wp id -> new uuid, per entity)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.id_map (
  entity     text        NOT NULL CHECK (entity IN
               ('product', 'variant', 'category', 'customer', 'address',
                'order', 'order_item', 'coupon_code', 'redirect', 'media')),
  wp_id      text        NOT NULL,   -- text: fits bigint ids AND voucher codes
  new_id     uuid        NOT NULL,
  batch_id   uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  -- snapshot of the projected values at last projection; used to detect
  -- admin edits in public that the importer must not clobber
  projected  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, wp_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS id_map_entity_new_id_uniq
  ON wp_import.id_map (entity, new_id);
CREATE INDEX IF NOT EXISTS id_map_batch_idx
  ON wp_import.id_map (batch_id);

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.id_map;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.id_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. products: wp products AND product_variations (one table, parent link)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.products (
  wp_post_id        bigint      PRIMARY KEY,
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  post_type         text        NOT NULL CHECK (post_type IN ('product', 'product_variation')),
  wp_parent_id      bigint,                 -- variation -> parent product
  slug_raw          text,                   -- post_name exactly as stored (may be percent-encoded)
  slug_decoded      text,                   -- percent-decoded, for humans + url mapping
  permalink         text,                   -- full old URL path
  title_he          text,
  description_html  text,                   -- post_content, raw
  excerpt_html      text,                   -- post_excerpt, raw
  status_raw        text,                   -- publish / draft / pending / private / trash
  sku               text,
  regular_price     numeric(12,2),
  sale_price        numeric(12,2),
  price             numeric(12,2),          -- Woo effective price (_price)
  currency          text        NOT NULL DEFAULT 'ILS',
  manage_stock      boolean,
  stock_status_raw  text,                   -- instock / outofstock / onbackorder
  stock_quantity    int,
  is_virtual        boolean     NOT NULL DEFAULT false,
  product_type_raw  text,                   -- simple / variable / external / grouped
  total_sales       int         NOT NULL DEFAULT 0,
  attributes        jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- unserialized _product_attributes / attribute_* meta
  category_wp_ids   bigint[]    NOT NULL DEFAULT '{}',
  tag_names         text[]      NOT NULL DEFAULT '{}',
  featured_image_wp_id bigint,
  gallery_wp_ids    bigint[]    NOT NULL DEFAULT '{}',
  seo_title_raw     text,                   -- Yoast/RankMath title if present
  seo_description_raw text,
  created_at_wp     timestamptz,
  modified_at_wp    timestamptz,
  -- curation columns (filled by 04-curation-import.ts before projection)
  proposed_slug     text,
  approved_slug     text,
  target_type       text        CHECK (target_type IS NULL OR target_type IN ('physical', 'coupon', 'service')),
  supplier_hint     text,
  exclude_from_import boolean   NOT NULL DEFAULT false,
  exclude_reason    text,
  raw_meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  raw_post          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wp_products_parent_idx
  ON wp_import.products (wp_parent_id) WHERE wp_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wp_products_status_idx
  ON wp_import.products (status_raw, post_type);
CREATE INDEX IF NOT EXISTS wp_products_slug_idx
  ON wp_import.products (slug_decoded);

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. categories: product_cat terms + curated mapping target
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.categories (
  wp_term_id        bigint      PRIMARY KEY,
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  slug_raw          text,
  slug_decoded      text,
  name_he           text,
  description       text,
  parent_wp_id      bigint,
  product_count     int         NOT NULL DEFAULT 0,
  thumbnail_wp_id   bigint,
  permalink         text,
  -- curation: slug of the EXISTING public.categories row this term maps to,
  -- or a new slug to create (create_new = true). NULL = undecided (blocker).
  manual_target_slug text,
  create_new        boolean     NOT NULL DEFAULT false,
  raw               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.categories;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. customers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.customers (
  wp_user_id        bigint      PRIMARY KEY,
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  email_raw         text,
  email_normalized  text,                   -- lower(trim(email)); NULL = not importable
  display_name      text,
  first_name        text,
  last_name         text,
  phone_raw         text,
  phone_normalized  text,                   -- 05X-XXXXXXX or NULL
  registered_at     timestamptz,
  last_active_at    timestamptz,
  is_paying_customer boolean    NOT NULL DEFAULT false,
  orders_count      int         NOT NULL DEFAULT 0,
  total_spent       numeric(12,2) NOT NULL DEFAULT 0,
  billing           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  shipping          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- any newsletter/marketing opt-in evidence found in wp (kept as evidence
  -- only; NEVER projected as consent without an explicit decision, see doc 7.5)
  newsletter_optin_raw jsonb,
  raw_meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wp_customers_email_idx
  ON wp_import.customers (email_normalized);

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.customers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. orders + order_items: PERMANENT ARCHIVE (not projected to public,
--    except the minimal chain for live vouchers; see doc section 1.4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.orders (
  wp_order_id       bigint      PRIMARY KEY,
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  storage_source    text        NOT NULL DEFAULT 'posts' CHECK (storage_source IN ('posts', 'hpos')),
  order_number      text,                   -- may differ from id under numbering plugins
  status_raw        text,                   -- wc-completed / wc-processing / ...
  currency          text        NOT NULL DEFAULT 'ILS',
  customer_wp_id    bigint,                 -- NULL or 0 in source = guest
  billing_email     text,
  billing_phone     text,
  billing           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  shipping          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  subtotal          numeric(12,2),
  discount_total    numeric(12,2),
  shipping_total    numeric(12,2),
  tax_total         numeric(12,2),
  total             numeric(12,2),
  refunded_total    numeric(12,2),
  payment_method    text,
  payment_method_title text,
  transaction_id    text,                   -- gateway txn id (evidence)
  customer_note     text,
  created_at_wp     timestamptz,
  paid_at_wp        timestamptz,
  completed_at_wp   timestamptz,
  raw               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wp_orders_customer_idx
  ON wp_import.orders (customer_wp_id);
CREATE INDEX IF NOT EXISTS wp_orders_status_idx
  ON wp_import.orders (status_raw);
CREATE INDEX IF NOT EXISTS wp_orders_email_idx
  ON wp_import.orders (billing_email);

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.orders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS wp_import.order_items (
  wp_order_item_id  bigint      PRIMARY KEY,
  wp_order_id       bigint      NOT NULL REFERENCES wp_import.orders(wp_order_id) ON DELETE CASCADE,
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  item_type         text,                   -- line_item / shipping / fee / coupon / tax
  product_wp_id     bigint,
  variation_wp_id   bigint,
  item_name         text,
  quantity          int,
  line_subtotal     numeric(12,2),
  line_total        numeric(12,2),
  line_tax          numeric(12,2),
  meta              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wp_order_items_order_idx
  ON wp_import.order_items (wp_order_id);
CREATE INDEX IF NOT EXISTS wp_order_items_product_idx
  ON wp_import.order_items (product_wp_id);

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.order_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. coupons: Woo cart discount codes (shop_coupon). Archive only.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.coupons (
  wp_post_id        bigint      PRIMARY KEY,
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  code              text,
  discount_type     text,                   -- percent / fixed_cart / fixed_product
  amount            numeric(12,2),
  usage_limit       int,
  usage_count       int         NOT NULL DEFAULT 0,
  expires_at_wp     timestamptz,
  status_raw        text,
  raw_meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.coupons;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. vouchers: sold deal-vouchers from the voucher plugin (identity of the
--    plugin is open question 7.1; the shape below is plugin-agnostic).
--    Only rows with a live entitlement get the minimal public projection.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.vouchers (
  voucher_code      text        PRIMARY KEY,
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  wp_order_id       bigint      REFERENCES wp_import.orders(wp_order_id) ON DELETE SET NULL,
  wp_order_item_id  bigint,
  product_wp_id     bigint,
  customer_wp_id    bigint,
  customer_email    text,
  status_raw        text,                   -- plugin-specific
  is_redeemed       boolean,
  paid_amount       numeric(12,2),          -- what was actually paid on the old site
  face_value        numeric(12,2),
  issued_at_wp      timestamptz,
  expires_at_wp     timestamptz,
  redeemed_at_wp    timestamptz,
  raw               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wp_vouchers_open_idx
  ON wp_import.vouchers (expires_at_wp)
  WHERE is_redeemed IS NOT TRUE;

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.vouchers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. media: attachment inventory + rewrite map (old url -> storage url)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.media (
  wp_attachment_id  bigint      PRIMARY KEY,
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  wp_parent_post_id bigint,
  source_url        text        NOT NULL,   -- original wp-content URL (size suffix stripped)
  file_name         text,
  mime_type         text,
  alt_text          text,
  title             text,
  width             int,
  height            int,
  byte_size         bigint,
  sha256            text,                   -- of the ORIGINAL file; dedupe key
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN
                      ('pending', 'downloaded', 'uploaded', 'skipped', 'failed')),
  error             text,
  bucket            text,                   -- e.g. 'product-images'
  storage_path      text,                   -- e.g. 'wp/<attachment_id>/<name>.webp'
  new_url           text,                   -- public URL after upload
  og_storage_path   text,                   -- 1200x630 <300KB derivative (primary images)
  created_at_wp     timestamptz,
  raw               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wp_media_sha256_idx
  ON wp_import.media (sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS wp_media_status_idx
  ON wp_import.media (status);
CREATE UNIQUE INDEX IF NOT EXISTS wp_media_storage_path_uniq
  ON wp_import.media (bucket, storage_path)
  WHERE storage_path IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.media;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.media
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. url_inventory: every old URL (sitemap + GSC + crawl) and its fate.
--     The 301-completeness gate (doc 5.3) runs on this table.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.url_inventory (
  old_path          text        PRIMARY KEY CHECK (old_path ~ '^/'),  -- normalized: percent-encoded kept, no trailing slash
  batch_id          uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  sources           text[]      NOT NULL DEFAULT '{}',  -- subset of {sitemap, gsc, crawl, manual}
  http_status_old   int,                    -- status observed on the old site
  gsc_clicks_12m    int         NOT NULL DEFAULT 0,
  gsc_impressions_12m bigint    NOT NULL DEFAULT 0,
  entity            text,                   -- product / category / page / media / other
  entity_wp_id      bigint,
  -- the decision: exactly one of mapped_new_path (301 target),
  -- direct_match (new site serves this same path), or gone_410.
  mapped_new_path   text        CHECK (mapped_new_path IS NULL OR mapped_new_path ~ '^/'),
  direct_match      boolean     NOT NULL DEFAULT false,
  gone_410          boolean     NOT NULL DEFAULT false,
  mapping_rule      text,                   -- which rule produced the target
  redirect_written_at timestamptz,          -- set when projected into public.seo_redirects
  verified_at       timestamptz,            -- last successful 301->200 check
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wp_url_inventory_undecided_idx
  ON wp_import.url_inventory (old_path)
  WHERE mapped_new_path IS NULL AND direct_match = false AND gone_410 = false;

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.url_inventory;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.url_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. issues: cleaning/validation findings. error = projection blocker.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.issues (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  entity      text        NOT NULL,
  wp_id       text        NOT NULL,
  severity    text        NOT NULL CHECK (severity IN ('error', 'warn', 'info')),
  code        text        NOT NULL,   -- e.g. 'missing_price', 'invalid_email', 'slug_collision'
  detail      text,
  resolved_at timestamptz,
  resolution  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- one open finding per (entity, wp_id, code); re-runs update instead of piling up
CREATE UNIQUE INDEX IF NOT EXISTS wp_issues_open_uniq
  ON wp_import.issues (entity, wp_id, code)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS wp_issues_severity_idx
  ON wp_import.issues (severity) WHERE resolved_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.issues;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. Reconciliation views (doc 5.1)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW wp_import.v_reconciliation AS
SELECT 'product'::text AS entity,
       (SELECT count(*) FROM wp_import.products
         WHERE post_type = 'product' AND status_raw = 'publish'
           AND exclude_from_import = false)                        AS staged,
       (SELECT count(*) FROM wp_import.id_map WHERE entity = 'product')  AS mapped
UNION ALL
SELECT 'variant',
       (SELECT count(*) FROM wp_import.products
         WHERE post_type = 'product_variation' AND exclude_from_import = false),
       (SELECT count(*) FROM wp_import.id_map WHERE entity = 'variant')
UNION ALL
SELECT 'category',
       (SELECT count(*) FROM wp_import.categories),
       (SELECT count(*) FROM wp_import.id_map WHERE entity = 'category')
UNION ALL
SELECT 'customer',
       (SELECT count(*) FROM wp_import.customers WHERE email_normalized IS NOT NULL),
       (SELECT count(*) FROM wp_import.id_map WHERE entity = 'customer')
UNION ALL
SELECT 'media_uploaded',
       (SELECT count(*) FROM wp_import.media),
       (SELECT count(*) FROM wp_import.media WHERE status = 'uploaded')
UNION ALL
SELECT 'voucher_open',
       (SELECT count(*) FROM wp_import.vouchers WHERE is_redeemed IS NOT TRUE),
       (SELECT count(*) FROM wp_import.id_map WHERE entity = 'coupon_code')
UNION ALL
SELECT 'redirect',
       (SELECT count(*) FROM wp_import.url_inventory
         WHERE mapped_new_path IS NOT NULL),
       (SELECT count(*) FROM wp_import.url_inventory
         WHERE redirect_written_at IS NOT NULL);

CREATE OR REPLACE VIEW wp_import.v_open_issues AS
SELECT severity, entity, code, count(*) AS findings
FROM wp_import.issues
WHERE resolved_at IS NULL
GROUP BY severity, entity, code
ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
         findings DESC;

-- ---------------------------------------------------------------------------
-- 13. RLS: enabled everywhere; admin SELECT only; no write policies
--     (service_role bypasses RLS and is the only writer).
-- ---------------------------------------------------------------------------

ALTER TABLE wp_import.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.id_map         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.coupons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.vouchers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.media          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.url_inventory  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.issues         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.import_batches;
CREATE POLICY "wp_import: admin read" ON wp_import.import_batches
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.id_map;
CREATE POLICY "wp_import: admin read" ON wp_import.id_map
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.products;
CREATE POLICY "wp_import: admin read" ON wp_import.products
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.categories;
CREATE POLICY "wp_import: admin read" ON wp_import.categories
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.customers;
CREATE POLICY "wp_import: admin read" ON wp_import.customers
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.orders;
CREATE POLICY "wp_import: admin read" ON wp_import.orders
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.order_items;
CREATE POLICY "wp_import: admin read" ON wp_import.order_items
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.coupons;
CREATE POLICY "wp_import: admin read" ON wp_import.coupons
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.vouchers;
CREATE POLICY "wp_import: admin read" ON wp_import.vouchers
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.media;
CREATE POLICY "wp_import: admin read" ON wp_import.media
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.url_inventory;
CREATE POLICY "wp_import: admin read" ON wp_import.url_inventory
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.issues;
CREATE POLICY "wp_import: admin read" ON wp_import.issues
  FOR SELECT TO authenticated USING (public.is_admin());
