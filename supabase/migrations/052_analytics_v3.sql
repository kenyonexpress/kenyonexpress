-- ===========================================================================
-- 052_analytics_v3.sql
-- Analytics & BI v3 delta on top of 033_analytics + 034_analytics_bi.
-- Design doc: ARCHITECTURE-ANALYTICS-BI.md section 11.
--
-- The design doc proposed editing drafts 033/034 in place. Project rule wins:
-- applied or not, a numbered migration is never edited. This file carries the
-- whole v3 delta and always sorts after 033/034, so both orders work:
--   fresh DB   : 033 -> 034 -> 052
--   partial DB : 052 alone, on top of an already-applied 033/034
--
-- Contents:
--   1. source_app dimension (analytics_events + analytics_daily + ingest)
--   2. analytics_identity_links (guest -> logged-in session stitching)
--   3. registry: checkout_step, web_vital
--   4. fn_ingest_analytics_events / fn_rollup_analytics_daily rewrites
--   5. v_funnel_daily extended with checkout_steps
--   6. v_repeat_purchase_monthly, v_web_vitals_daily
--
-- HARD PREREQUISITE: 033_analytics.sql
-- Apply ONLY via Supabase MCP apply_migration (never db push).
-- Every statement is idempotent; the whole file is one transaction.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Prerequisite guard
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.analytics_events') IS NULL
     OR to_regclass('public.analytics_daily') IS NULL
     OR to_regclass('public.analytics_event_definitions') IS NULL THEN
    RAISE EXCEPTION '052_analytics_v3 requires 033_analytics (analytics_* objects missing)';
  END IF;

  IF to_regproc('public.fn_il_date') IS NULL THEN
    RAISE EXCEPTION '052_analytics_v3 requires 033_analytics (fn_il_date missing)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. source_app: the product dimension (doc section 10)
--    `source` stays the platform axis (web / pwa / server).
--    `source_app` is the product axis (shop / delivery / taxi). Added now, on an
--    empty table, so the superapp verticals never require an ALTER on a live
--    partitioned table holding millions of rows.
-- ---------------------------------------------------------------------------
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS source_app text NOT NULL DEFAULT 'shop';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.analytics_events'::regclass
      AND conname  = 'analytics_events_source_app_check'
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_source_app_check
      CHECK (source_app IN ('shop', 'delivery', 'taxi'));
  END IF;
END $$;

COMMENT ON COLUMN public.analytics_events.source_app IS
  'Product vertical (shop / delivery / taxi). Orthogonal to source (platform). Ingest whitelists shop only for now; adding a vertical is a CREATE OR REPLACE on fn_ingest_analytics_events, never a table migration.';

-- Rollup key gains source_app so the historical aggregate is segmented from day
-- one. With a single vertical it is a constant column that adds no rows.
ALTER TABLE public.analytics_daily
  ADD COLUMN IF NOT EXISTS source_app text NOT NULL DEFAULT 'shop';

DO $$
DECLARE
  v_pk_name text;
  v_pk_cols text;
BEGIN
  SELECT c.conname,
         string_agg(a.attname, ',' ORDER BY k.ord)
    INTO v_pk_name, v_pk_cols
  FROM pg_constraint c
  CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
  WHERE c.conrelid = 'public.analytics_daily'::regclass
    AND c.contype  = 'p'
  GROUP BY c.conname;

  IF v_pk_cols IS DISTINCT FROM 'day_il,source_app,event_name,source' THEN
    IF v_pk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.analytics_daily DROP CONSTRAINT %I', v_pk_name);
    END IF;
    ALTER TABLE public.analytics_daily
      ADD CONSTRAINT analytics_daily_pkey
      PRIMARY KEY (day_il, source_app, event_name, source);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Guest -> logged-in stitching (doc section 2.2)
--    Written server-side only, once per (anonymous_id, user_id) pair, at login
--    and again inside beginCheckout (belt and braces). Attribution of
--    pre-login events happens at QUERY time: a wide UPDATE across partitions is
--    exactly what partitioning exists to avoid.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_identity_links (
  anonymous_id text        NOT NULL,
  user_id      uuid        NOT NULL,
  linked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anonymous_id, user_id)
);

COMMENT ON TABLE public.analytics_identity_links IS
  'Maps a guest anonymous_id (ke_session_id cookie) to the user who later logged in. Query-time stitching for funnels. Deleted together with the account by the 029 deletion job.';

-- The account-deletion job (029) sweeps by user_id.
CREATE INDEX IF NOT EXISTS idx_analytics_identity_links_user
  ON public.analytics_identity_links (user_id);

ALTER TABLE public.analytics_identity_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_identity_links: admin read" ON public.analytics_identity_links;
CREATE POLICY "analytics_identity_links: admin read"
  ON public.analytics_identity_links
  FOR SELECT USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policies: service role only.

-- ---------------------------------------------------------------------------
-- 3. Registry additions (doc sections 1.2, 7.1)
-- ---------------------------------------------------------------------------
INSERT INTO public.analytics_event_definitions
  (event_name, origin, required_props, description)
VALUES
  ('checkout_step', 'client', '["step"]'::jsonb,
   'Checkout funnel step before the Cardcom redirect: identity / address / payment_redirect. Separates "never started checkout" from "started and dropped before an order existed".'),
  ('web_vital',     'client', '["metric","value"]'::jsonb,
   'First-party RUM sample (LCP/CLS/INP/TTFB/FCP), 25% session sampling. Secondary to Vercel Speed Insights; the value here is 13-month retention and campaign segmentation.')
ON CONFLICT (event_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Ingest and rollup rewrites (source_app aware)
-- ---------------------------------------------------------------------------

-- Whitelist of accepted verticals. Anything else is coerced to 'shop' rather
-- than dropped: a mislabeled event is still a real event.
CREATE OR REPLACE FUNCTION public.fn_ingest_analytics_events(
  p_events     jsonb,
  p_user_id    uuid DEFAULT NULL,
  p_ip         inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_el          jsonb;
  v_def         public.analytics_event_definitions%ROWTYPE;
  v_event_id    uuid;
  v_occurred_at timestamptz;
  v_source      text;
  v_source_app  text;
  v_props       jsonb;
  v_key         text;
  v_valid       boolean;
  v_is_bot      boolean;
  v_ip_trunc    text;
  v_inserted    int := 0;
  v_rows        int;
BEGIN
  IF auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'fn_ingest_analytics_events: service role only';
  END IF;

  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'fn_ingest_analytics_events: p_events must be a jsonb array';
  END IF;

  IF jsonb_array_length(p_events) = 0 OR jsonb_array_length(p_events) > 50 THEN
    RAISE EXCEPTION 'fn_ingest_analytics_events: batch size must be 1..50';
  END IF;

  v_is_bot   := public.fn_is_bot_ua(p_user_agent);
  v_ip_trunc := CASE
                  WHEN p_ip IS NULL THEN NULL
                  WHEN family(p_ip) = 4 THEN host(network(set_masklen(p_ip, 24)))
                  ELSE host(network(set_masklen(p_ip, 48)))
                END;

  FOR v_el IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    BEGIN
      -- registry validation: known, active, not derived
      SELECT * INTO v_def
      FROM public.analytics_event_definitions d
      WHERE d.event_name = v_el->>'event_name'
        AND d.is_active
        AND d.origin <> 'derived';
      IF NOT FOUND THEN CONTINUE; END IF;

      -- props: object, size-capped, all required keys present
      v_props := COALESCE(v_el->'props', '{}'::jsonb);
      IF jsonb_typeof(v_props) <> 'object'
         OR octet_length(v_props::text) > 4096 THEN
        CONTINUE;
      END IF;
      v_valid := true;
      FOR v_key IN SELECT jsonb_array_elements_text(v_def.required_props) LOOP
        IF NOT v_props ? v_key THEN
          v_valid := false;
          EXIT;
        END IF;
      END LOOP;
      IF NOT v_valid THEN CONTINUE; END IF;

      -- clock clamp: future -> now, older than 7 days -> drop
      v_occurred_at := COALESCE((v_el->>'occurred_at')::timestamptz, now());
      IF v_occurred_at > now() + interval '5 minutes' THEN
        v_occurred_at := now();
      END IF;
      IF v_occurred_at < now() - interval '7 days' THEN CONTINUE; END IF;

      v_source := COALESCE(v_el->>'source', 'web');
      IF v_source NOT IN ('web', 'pwa', 'server') THEN
        v_source := 'web';
      END IF;

      -- v3: product vertical. Only 'shop' ships today; a future vertical is a
      -- one-line change here, with no DDL on the partitioned table.
      v_source_app := COALESCE(v_el->>'source_app', 'shop');
      IF v_source_app NOT IN ('shop') THEN
        v_source_app := 'shop';
      END IF;

      v_event_id := COALESCE(NULLIF(v_el->>'event_id', '')::uuid, gen_random_uuid());

      INSERT INTO public.analytics_events (
        event_id, event_name, schema_version, occurred_at, source, source_app,
        anonymous_id, session_id, user_id, path, referrer, utm, props,
        ip_trunc, user_agent, is_bot
      ) VALUES (
        v_event_id,
        v_def.event_name,
        v_def.schema_version,          -- server-authoritative, never from client
        v_occurred_at,
        v_source,
        v_source_app,
        left(v_el->>'anonymous_id', 64),
        left(v_el->>'session_id', 64),
        p_user_id,                     -- resolved by the route from the session
        left(v_el->>'path', 300),
        left(v_el->>'referrer', 600),
        CASE WHEN jsonb_typeof(v_el->'utm') = 'object' THEN v_el->'utm' ELSE NULL END,
        v_props,
        v_ip_trunc,
        left(p_user_agent, 400),
        v_is_bot
      )
      ON CONFLICT (occurred_at, event_id) DO NOTHING;

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_inserted := v_inserted + v_rows;
    EXCEPTION WHEN others THEN
      CONTINUE;  -- one malformed element never fails the batch
    END;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ingest_analytics_events(jsonb, uuid, inet, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ingest_analytics_events(jsonb, uuid, inet, text) TO service_role;

-- Rollup gains source_app in the GROUP BY, matching the new PK.
CREATE OR REPLACE FUNCTION public.fn_rollup_analytics_daily(p_day date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_day  date        := COALESCE(p_day, public.fn_il_date(now() - interval '1 day'));
  v_from timestamptz := (v_day::timestamp AT TIME ZONE 'Asia/Jerusalem');
  v_to   timestamptz := ((v_day + 1)::timestamp AT TIME ZONE 'Asia/Jerusalem');
BEGIN
  IF auth.role() IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'fn_rollup_analytics_daily: admin or service role only';
  END IF;

  DELETE FROM public.analytics_daily WHERE day_il = v_day;

  INSERT INTO public.analytics_daily
    (day_il, source_app, event_name, source, events_count, unique_sessions, unique_users)
  SELECT
    v_day,
    ae.source_app,
    ae.event_name,
    ae.source,
    count(*),
    count(DISTINCT ae.session_id),
    count(DISTINCT ae.user_id)
  FROM public.analytics_events ae
  WHERE ae.occurred_at >= v_from
    AND ae.occurred_at <  v_to
    AND NOT ae.is_bot
    AND (ae.user_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = ae.user_id
            AND p.role IN ('admin'::public.user_role,
                           'super_admin'::public.user_role,
                           'content_uploader'::public.user_role)))
  GROUP BY ae.source_app, ae.event_name, ae.source;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_rollup_analytics_daily(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rollup_analytics_daily(date) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. v_funnel_daily: checkout_steps between add_to_carts and checkouts
--    (doc section 4.4). Dropped and recreated rather than replaced: CREATE OR
--    REPLACE VIEW can only append columns, and the column order carries meaning
--    here (it is the funnel order).
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_funnel_daily;
CREATE VIEW public.v_funnel_daily
WITH (security_invoker = true) AS
SELECT
  ad.day_il,
  COALESCE(sum(ad.unique_sessions) FILTER (WHERE ad.event_name = 'page_view'), 0)      AS sessions,
  COALESCE(sum(ad.events_count)    FILTER (WHERE ad.event_name = 'view_product'), 0)   AS product_views,
  COALESCE(sum(ad.events_count)    FILTER (WHERE ad.event_name = 'add_to_cart'), 0)    AS add_to_carts,
  COALESCE(sum(ad.events_count)    FILTER (WHERE ad.event_name = 'checkout_step'), 0)  AS checkout_steps,
  COALESCE(sum(ad.events_count)    FILTER (WHERE ad.event_name = 'begin_checkout'), 0) AS checkouts,
  (SELECT count(*) FROM public.orders o
    WHERE o.paid_at IS NOT NULL AND public.fn_il_date(o.paid_at) = ad.day_il)          AS purchases
FROM public.analytics_daily ad
GROUP BY ad.day_il;

COMMENT ON VIEW public.v_funnel_daily IS
  'Daily behavioral funnel from the rollup, joined to purchases from the money truth table. Step-to-step conversion percentages are computed in the presentation layer: one raw number here, many ratios there.';

-- 5.1 Weekly channel revenue moves to a Sunday-start week.
--     date_trunc('week') is ISO, i.e. Monday. The Israeli business week starts
--     on Sunday, and the admin dashboard buckets weeks that way, so the view has
--     to agree: two answers to "how did last week go" is a bug by definition.
CREATE OR REPLACE VIEW public.v_channel_revenue_weekly
WITH (security_invoker = true) AS
SELECT
  (date_trunc('week', (o.paid_at AT TIME ZONE 'Asia/Jerusalem') + interval '1 day')
    - interval '1 day')::date                                         AS week_start,
  COALESCE(o.attribution #>> '{last,utm_source}', '(direct)')         AS utm_source,
  COALESCE(o.attribution #>> '{last,utm_campaign}', '(none)')         AS utm_campaign,
  count(DISTINCT o.id)                                                AS orders,
  sum(oi.total_price_ils)                                             AS gmv_ils,
  sum(oi.platform_fee_ils)                                            AS platform_revenue_ils
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
GROUP BY 1, 2, 3;

COMMENT ON VIEW public.v_channel_revenue_weekly IS
  'Last-touch UTM revenue per Sunday-start Israeli week. Weeks start on Sunday everywhere in this system, including the admin dashboard.';

-- ---------------------------------------------------------------------------
-- 6. New reporting views (doc sections 4.3, 7.3)
-- ---------------------------------------------------------------------------

-- 6.1 New vs returning buyers per Israel month. Complements cohort retention:
--     retention answers "does a cohort come back", this answers "who bought
--     this month".
CREATE OR REPLACE VIEW public.v_repeat_purchase_monthly
WITH (security_invoker = true) AS
WITH paid AS (
  SELECT
    o.id,
    o.user_id,
    o.paid_at,
    date_trunc('month', (o.paid_at AT TIME ZONE 'Asia/Jerusalem'))::date AS month_il
  FROM public.orders o
  WHERE o.paid_at IS NOT NULL
    AND o.deleted_at IS NULL
    AND o.user_id IS NOT NULL
),
first_paid AS (
  SELECT user_id, min(paid_at) AS first_paid_at
  FROM paid
  GROUP BY user_id
)
SELECT
  p.month_il,
  count(DISTINCT p.user_id)                                                   AS buyers,
  count(DISTINCT p.user_id) FILTER (
    WHERE date_trunc('month', (f.first_paid_at AT TIME ZONE 'Asia/Jerusalem'))::date
        = p.month_il)                                                         AS new_buyers,
  count(DISTINCT p.user_id) FILTER (
    WHERE date_trunc('month', (f.first_paid_at AT TIME ZONE 'Asia/Jerusalem'))::date
        < p.month_il)                                                         AS repeat_buyers,
  round(100.0 * count(DISTINCT p.user_id) FILTER (
    WHERE date_trunc('month', (f.first_paid_at AT TIME ZONE 'Asia/Jerusalem'))::date
        < p.month_il)
    / NULLIF(count(DISTINCT p.user_id), 0), 1)                                AS repeat_rate_pct,
  round(count(*)::numeric / NULLIF(count(DISTINCT p.user_id), 0), 2)          AS orders_per_buyer
FROM paid p
JOIN first_paid f ON f.user_id = p.user_id
GROUP BY p.month_il;

COMMENT ON VIEW public.v_repeat_purchase_monthly IS
  'Per Israel month: buyers split into first-ever buyers and returning buyers, plus orders per buyer. A buyer whose first paid order is in this month counts as new, everyone else as repeat.';

-- 6.2 Field Web Vitals per day / metric / route, against the PERFORMANCE 4.1
--     budgets. Reads raw events (13 months is plenty for perf analysis); bots
--     excluded like every other report.
CREATE OR REPLACE VIEW public.v_web_vitals_daily
WITH (security_invoker = true) AS
SELECT
  public.fn_il_date(ae.occurred_at)                              AS day_il,
  ae.props->>'metric'                                            AS metric,
  COALESCE(ae.props->>'route', '(unknown)')                      AS route,
  count(*)                                                       AS samples,
  round(percentile_cont(0.75) WITHIN GROUP (
    ORDER BY (ae.props->>'value')::numeric)::numeric, 3)         AS p75,
  round(100.0 * count(*) FILTER (WHERE ae.props->>'rating' = 'good')
    / NULLIF(count(*), 0), 1)                                    AS pct_good
FROM public.analytics_events ae
WHERE ae.event_name = 'web_vital'
  AND NOT ae.is_bot
  AND jsonb_typeof(ae.props->'value') = 'number'
GROUP BY 1, 2, 3;

COMMENT ON VIEW public.v_web_vitals_daily IS
  'First-party RUM rollup: p75 per (Israel day, metric, route template). Route is the template (/product/[slug]), never the full path, to keep cardinality bounded. p75 over budget for 7 consecutive days opens a performance task before feature work.';

-- ===========================================================================
-- NOT in 052 (deliberately):
--   * cron scheduling: pg_cron blocks live in supabase/schedules/, run at apply
--     time, never inside a numbered migration
--   * application code: SDK, /api/a, consent banner, dashboard, begin_checkout
--     emission (doc section 11.3)
--   * any edit to 033 / 034
-- ===========================================================================
