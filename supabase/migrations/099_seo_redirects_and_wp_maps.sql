-- 095_seo_redirects_and_wp_maps.sql
--
-- The runtime half of the WordPress migration's SEO continuity, plus the
-- named mapping surfaces the import reports against.
--
-- WHY public.seo_redirects HAS TO EXIST
--
-- 032 already gives the import everything it needs to DECIDE a redirect:
-- wp_import.url_inventory holds every old path, its target and its 410s. What
-- has never existed is anywhere for src/proxy.ts to READ that decision.
-- wp_import is service_role only and deliberately not exposed to PostgREST, so
-- the storefront cannot see it. Until this table exists, every 301 the pipeline
-- computes is a row in a JSON file that nobody serves, and the day DNS flips
-- every indexed URL 404s.
--
-- WHY THERE IS NO wp_product_map / wp_category_map TABLE
--
-- The goal named three mapping tables. Two of them already exist under another
-- name: wp_import.id_map is (entity, wp_id) -> target_id and has covered
-- products and categories since 032, and it is what every stage upserts
-- through, so a second product map would be a second source of truth for the
-- same fact and the two would diverge on the first partial re-run. What id_map
-- lacks is the human-readable half (slug, title, status) that makes a report
-- readable, so the named surfaces are VIEWS that join it to the projected row.
-- The third, wp_redirect_map, is genuinely missing and is what this file adds
-- as public.seo_redirects.

-- ---------------------------------------------------------------------------
-- Defensive: 001 is not idempotent and may have stopped early on a live DB.
-- ---------------------------------------------------------------------------

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
-- 1. public.seo_redirects: the table src/proxy.ts reads on every request
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.seo_redirects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Normalised comparison form: host stripped, lowercased, percent-decoded,
  -- NFC-normalised, no trailing slash, no query string. The proxy MUST apply
  -- the identical normalisation to an incoming path or a row written here can
  -- never match the request it was written for. NFC matters for Hebrew
  -- specifically: composed and decomposed encodings of the same word are
  -- different byte strings and would never compare equal.
  source_path  text NOT NULL,

  -- Empty string for a 410. Never NULL, so the CHECK below stays total.
  target_path  text NOT NULL DEFAULT '',

  -- 301 or 410 only. 302 says "temporary" and does not pass ranking; 308 is
  -- not what search engines treat as a permanent move with the same certainty.
  -- A migration that lands either of those has silently lost the SEO equity
  -- that was the entire point.
  status_code  smallint NOT NULL DEFAULT 301,

  entity_type  text,
  wp_id        bigint,

  -- Which rule produced this row, carried from url_inventory.mapping_rule.
  -- 'wp_old_slug' rows in particular are worth being able to count: they are
  -- URLs that appear in no sitemap and no current permalink.
  mapping_rule text,

  -- Traffic evidence. Updated in batches by a job, never on the request path.
  -- This is what answers "can this row be retired yet", which is otherwise a
  -- guess forever.
  hits         bigint NOT NULL DEFAULT 0,
  last_hit_at  timestamptz,

  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.seo_redirects
      ADD CONSTRAINT seo_redirects_source_unique UNIQUE (source_path);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.seo_redirects
      ADD CONSTRAINT seo_redirects_status_code_allowed
      CHECK (status_code IN (301, 410));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- A target written onto a 410 row is a contradiction: the row says "gone"
  -- and carries somewhere to go. It is the shape a half-finished edit takes.
  BEGIN
    ALTER TABLE public.seo_redirects
      ADD CONSTRAINT seo_redirects_410_has_no_target
      CHECK (status_code <> 410 OR target_path = '');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- A 301 has to go somewhere.
  BEGIN
    ALTER TABLE public.seo_redirects
      ADD CONSTRAINT seo_redirects_301_has_target
      CHECK (status_code <> 301 OR length(target_path) > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- /product/x -> /product/x is an infinite redirect. It takes a page that
  -- was working and makes it unreachable, and it is the single easiest bug to
  -- introduce here: it is what you get by writing a row for every URL instead
  -- of only for the ones that moved.
  BEGIN
    ALTER TABLE public.seo_redirects
      ADD CONSTRAINT seo_redirects_no_self_loop
      CHECK (source_path <> target_path);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Both paths are host-relative. An absolute URL here would let a row send
  -- traffic off the domain, which is an open-redirect served by our own proxy.
  BEGIN
    ALTER TABLE public.seo_redirects
      ADD CONSTRAINT seo_redirects_paths_are_relative
      CHECK (
        source_path LIKE '/%'
        AND (target_path = '' OR target_path LIKE '/%')
        AND source_path NOT LIKE '//%'
        AND target_path NOT LIKE '//%'
      );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- The proxy's only query: exact match on an active row.
CREATE INDEX IF NOT EXISTS seo_redirects_active_source_idx
  ON public.seo_redirects (source_path)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS seo_redirects_wp_id_idx
  ON public.seo_redirects (wp_id)
  WHERE wp_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.seo_redirects;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.seo_redirects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.seo_redirects ENABLE ROW LEVEL SECURITY;

-- Public read: the proxy resolves redirects without a session, and where a
-- retired URL now points is not a secret. Inactive rows stay hidden so
-- toggling is_active is a real kill switch rather than a hint.
DROP POLICY IF EXISTS seo_redirects_public_read ON public.seo_redirects;
CREATE POLICY seo_redirects_public_read ON public.seo_redirects
  FOR SELECT TO anon, authenticated
  USING (is_active);

DROP POLICY IF EXISTS seo_redirects_admin_read ON public.seo_redirects;
CREATE POLICY seo_redirects_admin_read ON public.seo_redirects
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Deliberately NO client write policy of any kind. The import writes through
-- the service role; a browser-writable redirect table is an open redirect and
-- a way to hijack the ranking of any page on the site.

COMMENT ON TABLE public.seo_redirects IS
  'Runtime 301/410 map read by src/proxy.ts. source_path and target_path are '
  'host-relative and stored in the normalised comparison form (lowercase, '
  'percent-decoded, NFC, no trailing slash, no query). Projected from '
  'wp_import.url_inventory by wp_import.fn_project_redirects(). No client '
  'write policy: writes are service-role only.';

-- ---------------------------------------------------------------------------
-- 2. The named mapping surfaces, as views over the canonical id_map
-- ---------------------------------------------------------------------------

-- Join note: id_map.wp_id is TEXT (it is a generic map keyed by entity, and a
-- WooCommerce id is not the only kind of key it holds), while the staging
-- tables key on BIGINT. The comparison is done on the text side rather than
-- casting wp_id to bigint, because a single non-numeric key in id_map would
-- make the cast throw and take the whole view down at query time rather than
-- returning the rows it can.
CREATE OR REPLACE VIEW wp_import.wp_product_map AS
SELECT
  m.wp_id                        AS wp_post_id,
  m.new_id                       AS product_id,
  (m.projected IS NOT NULL)      AS is_projected,
  m.projected                    AS projected_payload,
  p.slug                         AS new_slug,
  p.name_he                      AS name_he,
  p.status                       AS status,
  (s.wp_post_id IS NOT NULL)     AS in_staging,
  -- approved_slug is the operator's override and wins over the computed one,
  -- which is the same precedence 04-project-public applies when it writes.
  COALESCE(s.approved_slug, s.proposed_slug, s.slug_decoded) AS staged_slug,
  s.title_he                     AS staged_title,
  s.exclude_from_import          AS excluded,
  s.exclude_reason               AS exclude_reason,
  m.created_at                   AS mapped_at
FROM wp_import.id_map m
LEFT JOIN public.products      p ON p.id = m.new_id
LEFT JOIN wp_import.products   s ON s.wp_post_id::text = m.wp_id
WHERE m.entity = 'product';

CREATE OR REPLACE VIEW wp_import.wp_category_map AS
SELECT
  m.wp_id                        AS wp_term_id,
  m.new_id                       AS category_id,
  (m.projected IS NOT NULL)      AS is_projected,
  m.projected                    AS projected_payload,
  c.slug                         AS new_slug,
  c.name_he                      AS name_he,
  c.parent_id                    AS parent_id,
  c.is_active                    AS is_active,
  (s.wp_term_id IS NOT NULL)     AS in_staging,
  COALESCE(s.manual_target_slug, s.slug_decoded) AS staged_slug,
  s.parent_wp_id                 AS staged_parent_wp_id,
  s.product_count                AS staged_product_count,
  m.created_at                   AS mapped_at
FROM wp_import.id_map m
LEFT JOIN public.categories     c ON c.id = m.new_id
LEFT JOIN wp_import.categories  s ON s.wp_term_id::text = m.wp_id
WHERE m.entity = 'category';

-- The redirect map, joined to what actually got served. `projected` is the
-- question worth asking: a decided redirect that never reached
-- public.seo_redirects is a 404 waiting for cutover day.
CREATE OR REPLACE VIEW wp_import.wp_redirect_map AS
SELECT
  u.old_path,
  u.mapped_new_path,
  u.entity,
  u.entity_wp_id,
  u.mapping_rule,
  u.direct_match,
  u.gone_410,
  u.gsc_clicks_12m,
  u.gsc_impressions_12m,
  u.redirect_written_at,
  (r.id IS NOT NULL)  AS projected,
  r.status_code       AS served_status,
  r.target_path       AS served_target,
  r.is_active         AS served_active,
  r.hits              AS hits,
  r.last_hit_at       AS last_hit_at,
  -- The row worth alerting on: a URL that earned clicks in the last year, was
  -- decided, and is not being served. That is measurable lost traffic on
  -- cutover day rather than a hypothetical one.
  (r.id IS NULL AND NOT u.direct_match AND COALESCE(u.gsc_clicks_12m, 0) > 0) AS unserved_with_traffic
FROM wp_import.url_inventory u
LEFT JOIN public.seo_redirects r
  ON r.source_path = rtrim(lower(u.old_path), '/');

COMMENT ON VIEW wp_import.wp_product_map IS
  'Named surface over wp_import.id_map WHERE entity = product, joined to the '
  'projected public.products row. A view and not a table because id_map is the '
  'single source of truth every stage upserts through; a second product map '
  'would diverge from it on the first partial re-run.';

-- ---------------------------------------------------------------------------
-- 3. Projection: url_inventory -> seo_redirects, idempotent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION wp_import.fn_project_redirects(
  p_batch_id uuid DEFAULT NULL,
  p_dry_run  boolean DEFAULT true
)
RETURNS TABLE (
  action       text,
  source_path  text,
  target_path  text,
  status_code  smallint,
  mapping_rule text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = wp_import, public, pg_temp
AS $$
BEGIN
  -- Dry run is the default here for the same reason it is in the runner: this
  -- function is the last step before a redirect becomes something the public
  -- internet is served, and the plan is worth reading first.

  RETURN QUERY
  WITH candidate AS (
    SELECT
      -- Must match the normalisation in scripts/wp-import/02-transform.mjs and
      -- in the proxy. Kept deliberately simple (lower + strip trailing slash);
      -- percent-decoding and NFC are done upstream in JS, where a full Unicode
      -- normaliser exists, and the result is stored already-decoded.
      rtrim(lower(u.old_path), '/')                        AS src,
      COALESCE(rtrim(lower(u.mapped_new_path), '/'), '')   AS tgt,
      CASE WHEN u.gone_410 THEN 410 ELSE 301 END::smallint AS code,
      u.entity                                             AS ent,
      u.entity_wp_id                                       AS wp,
      u.mapping_rule                                       AS rule
    FROM wp_import.url_inventory u
    WHERE (p_batch_id IS NULL OR u.batch_id = p_batch_id)
      -- A path that already equals its destination needs no row. Writing one
      -- produces an infinite redirect, and the CHECK would reject it anyway.
      AND u.direct_match IS NOT TRUE
      AND (u.gone_410 OR u.mapped_new_path IS NOT NULL)
  ),
  cleaned AS (
    SELECT * FROM candidate
    WHERE src <> ''
      AND src LIKE '/%'
      AND (code = 410 OR (tgt <> '' AND tgt LIKE '/%'))
      AND src <> tgt
  ),
  -- One row per source_path. A parent and a child term can normalise to the
  -- same old path, and the UNIQUE constraint would abort the whole projection
  -- on the second one.
  deduped AS (
    SELECT DISTINCT ON (src) *
    FROM cleaned
    ORDER BY src, (rule = 'wp_old_slug'), wp
  ),
  upserted AS (
    INSERT INTO public.seo_redirects
      (source_path, target_path, status_code, entity_type, wp_id, mapping_rule, is_active)
    SELECT src, CASE WHEN code = 410 THEN '' ELSE tgt END, code, ent, wp, rule, true
    FROM deduped
    WHERE NOT p_dry_run
    ON CONFLICT (source_path) DO UPDATE
      SET target_path  = EXCLUDED.target_path,
          status_code  = EXCLUDED.status_code,
          entity_type  = EXCLUDED.entity_type,
          wp_id        = EXCLUDED.wp_id,
          mapping_rule = EXCLUDED.mapping_rule,
          is_active    = true,
          updated_at   = now()
      -- hits and last_hit_at are NOT touched: re-running the projection must
      -- not destroy the traffic evidence that says whether a row still earns
      -- its place.
    RETURNING seo_redirects.source_path, (xmax = 0) AS inserted
  )
  SELECT
    CASE
      WHEN p_dry_run THEN 'plan'
      WHEN up.inserted THEN 'insert'
      ELSE 'update'
    END::text,
    d.src,
    CASE WHEN d.code = 410 THEN '' ELSE d.tgt END,
    d.code,
    d.rule
  FROM deduped d
  LEFT JOIN upserted up ON up.source_path = d.src
  ORDER BY d.src;
END;
$$;

REVOKE ALL ON FUNCTION wp_import.fn_project_redirects(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wp_import.fn_project_redirects(uuid, boolean) TO service_role;

COMMENT ON FUNCTION wp_import.fn_project_redirects(uuid, boolean) IS
  'Projects wp_import.url_inventory into public.seo_redirects. Dry run by '
  'default. Skips direct_match rows (a self-redirect is an infinite loop), '
  'dedupes on source_path, and never overwrites hits/last_hit_at.';

-- ---------------------------------------------------------------------------
-- 4. Hit counting, in batches, off the request path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_record_redirect_hits(p_paths text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Called by a background flush with a batch of paths, never once per
  -- request: a write on the redirect path would put a database round trip in
  -- front of a 301 that is otherwise served from an in-memory map.
  UPDATE public.seo_redirects r
     SET hits = r.hits + c.n,
         last_hit_at = now()
    FROM (SELECT p AS path, count(*) AS n FROM unnest(p_paths) AS p GROUP BY p) c
   WHERE r.source_path = c.path;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_record_redirect_hits(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_redirect_hits(text[]) TO service_role;
