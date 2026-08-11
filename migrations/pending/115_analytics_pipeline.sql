-- 115: the analytics pipeline, which production has never had.
--
-- NOT APPLIED. Nothing in migrations/pending/ has been run.
--
-- WHAT WAS MEASURED, ON 2026-08-12, AGAINST THE LIVE PROJECT
--
--   SELECT ... FROM information_schema.tables WHERE table_name LIKE '%analytic%'
--   UNION ALL
--   SELECT ... FROM information_schema.routines WHERE routine_name LIKE '%analytic%'
--
-- returned the empty set. Not "an older shape", not "missing a column": zero
-- rows. `analytics_events`, `analytics_daily`, `analytics_event_definitions`,
-- `analytics_identity_links`, `fn_ingest_analytics_events`,
-- `fn_rollup_analytics_daily`, `fn_il_date`, `fn_is_bot_ua` and the view
-- `v_funnel_daily` all exist only in `supabase/migrations/033`, `034` and `056`,
-- which describe a database this project does not have.
--
-- THREE LIVE CODE PATHS FAIL SILENTLY BECAUSE OF IT
--
--   1. `POST /api/a` (src/app/api/a/route.ts:79) calls
--      `fn_ingest_analytics_events` on every batch of client events. The route
--      logs `analytics.ingest_failed` and returns 204 regardless, on purpose:
--      a dead analytics pipeline must never break a page. So every page_view,
--      view_product, add_to_cart, checkout_step and web_vital this site has
--      ever sent has been dropped, and nothing in the UI ever said so.
--
--   2. `linkAnalyticsIdentity` (src/server/analytics/track.ts:82) upserts into
--      `analytics_identity_links` at login and again at checkout, inside a
--      try/catch that logs and swallows. Every guest-to-account stitch has
--      failed, which is exactly the join that makes pre-login browsing
--      attributable at query time.
--
--   3. `funnelTotals` (src/server/analytics/queries.ts:136) selects from
--      `v_funnel_daily`. The admin funnel has been reading a view that is not
--      there.
--
-- A fourth is a column rather than a table: `orders.attribution` (033 section 6)
-- does not exist either, so `stampOrderAttribution` (track.ts:122) has never
-- written a marketing attribution snapshot onto an order. Section 7 below adds
-- it, because an attribution pipeline that cannot name the campaign that paid
-- for an order answers the only question anyone asks of it.
--
-- WHY THIS IS NOT "APPLY 033, THEN 034, THEN 056"
--
-- Because 033 would fail here, and for an instructive reason. Its section 7
-- creates reporting indexes on `coupon_scan_events`, and that table does not
-- exist in production either. Its section 8 creates twelve reporting views over
-- tables from the same absent lineage. Replaying the chain would mean applying
-- ~1800 lines to install the ~400 that anything reads, and failing on the first
-- object belonging to a subsystem that was never installed.
--
-- So this file is the distillation: every analytics object that a live code
-- path touches, at its FINAL shape (033 as amended by 056), and nothing else.
-- `source_app` is in the CREATE TABLE rather than in a later ALTER, and
-- `analytics_daily`'s primary key is 056's four-column key from the start.
--
-- WHAT IS DELIBERATELY LEFT OUT
--
--   - The twelve reporting views of 033 section 8 and 034. Only `v_funnel_daily`
--     is read by this application; `v_admin_pending_queues`, `v_low_stock`,
--     `v_wallet_ledger` and `v_discount_campaign_performance` are the other four
--     views the code reads and all four already exist in production.
--   - `v_money_alarms`, which reports rows stranded in the DEFAULT partition. It
--     belongs to the hardening queue, not to making ingest work.
--   - Any backfill. There is nothing to backfill: the events were never
--     written, and no other store holds them.
--
-- Idempotent, forward-only, one transaction.

BEGIN;

-- ===========================================================================
-- 0. Guards
-- ===========================================================================
-- These are the objects this file builds ON, all four verified present in
-- production on 2026-08-12. If any is missing, the database is not the one this
-- file was measured against and it must not run.
DO $$
BEGIN
  IF to_regproc('public.is_admin') IS NULL THEN
    RAISE EXCEPTION '115 requires public.is_admin()';
  END IF;
  IF to_regproc('public.set_updated_at') IS NULL THEN
    RAISE EXCEPTION '115 requires public.set_updated_at()';
  END IF;
  IF to_regclass('public.orders') IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION '115 requires public.orders and public.profiles';
  END IF;
  -- fn_rollup_analytics_daily excludes staff traffic by these three roles.
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
      AND e.enumlabel = 'content_uploader'
  ) THEN
    RAISE EXCEPTION '115 requires public.user_role with a content_uploader member';
  END IF;
END $$;

-- ===========================================================================
-- 1. Helpers (033 section 1, verbatim)
-- ===========================================================================

-- Business day in Israel. Marked IMMUTABLE deliberately (tz rules change ~never
-- for Asia/Jerusalem going forward) so it can be used in rollups and indexes.
CREATE OR REPLACE FUNCTION public.fn_il_date(p_ts timestamptz)
RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (p_ts AT TIME ZONE 'Asia/Jerusalem')::date
$$;

COMMENT ON FUNCTION public.fn_il_date(timestamptz) IS
  'Canonical reporting day: calendar date in Asia/Jerusalem. Never use ::date directly on timestamptz in reports.';

CREATE OR REPLACE FUNCTION public.fn_is_bot_ua(p_ua text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    p_ua ~* '(bot|crawl|spider|slurp|headless|phantom|lighthouse|pagespeed|pingdom|uptime|monitor|checkly|curl|wget|python-requests|scrapy|httpclient|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|preview|prerender)',
    false)
$$;

COMMENT ON FUNCTION public.fn_is_bot_ua(text) IS
  'Heuristic bot classifier over the User-Agent. Bots are stored (is_bot = true) and excluded at rollup, never dropped at ingest: a suppressed row cannot be re-classified later.';

-- ===========================================================================
-- 2. Event registry (the taxonomy source of truth)
-- ===========================================================================
-- Ingest refuses any event_name that is not registered here, active, and
-- non-derived. The first eight rows seeded below are exactly the eight names the
-- application can emit: CLIENT_EVENT_NAMES (src/lib/analytics/events.ts:6)
-- plus SERVER_EVENT_NAMES (line 19). The six `derived` rows are registered and
-- permanently un-ingestable on purpose, so the taxonomy names the facts that
-- live in their own money/search tables instead.
CREATE TABLE IF NOT EXISTS public.analytics_event_definitions (
  event_name     text        PRIMARY KEY
                   CHECK (event_name ~ '^[a-z][a-z0-9_]{2,49}$'),
  origin         text        NOT NULL
                   CHECK (origin IN ('client', 'server', 'derived')),
  schema_version smallint    NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  required_props jsonb       NOT NULL DEFAULT '[]'::jsonb
                   CHECK (jsonb_typeof(required_props) = 'array'),
  description    text,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.analytics_event_definitions IS
  'Canonical event taxonomy. Ingest rejects events not registered here. origin=derived events are NEVER written to analytics_events; they live in their source-of-truth tables (orders, payments, voucher_redemptions, wallet_transactions, search_events).';

DROP TRIGGER IF EXISTS set_updated_at ON public.analytics_event_definitions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.analytics_event_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NOTE, inherited verbatim from 033 and still true: no audit_log trigger here.
-- The shared audit trigger reads NEW.id / OLD.id into audit_log.entity_id (uuid
-- NOT NULL). This registry is keyed by event_name (text) and has no id column,
-- so attaching it makes every write fail with 42703, including the seed below.
DROP TRIGGER IF EXISTS audit_analytics_event_definitions ON public.analytics_event_definitions;

INSERT INTO public.analytics_event_definitions
  (event_name, origin, required_props, description)
VALUES
  ('page_view',        'client',  '[]'::jsonb,
   'Any page render on web/PWA'),
  ('view_product',     'client',  '["product_id"]'::jsonb,
   'Product page viewed'),
  ('view_category',    'client',  '["category_id"]'::jsonb,
   'Category page viewed'),
  ('add_to_cart',      'client',  '["product_id","quantity"]'::jsonb,
   'Item added to cart'),
  ('remove_from_cart', 'client',  '["product_id"]'::jsonb,
   'Item removed from cart'),
  ('checkout_step',    'client',  '["step"]'::jsonb,
   'Checkout funnel step before the Cardcom redirect: identity / address / payment_redirect. Separates "never started checkout" from "started and dropped before an order existed".'),
  ('web_vital',        'client',  '["metric","value"]'::jsonb,
   'First-party RUM sample (LCP/CLS/INP/TTFB/FCP), 25% session sampling. Secondary to Vercel Speed Insights; the value here is 13-month retention and campaign segmentation.'),
  ('begin_checkout',   'server',  '["order_id","items_count"]'::jsonb,
   'Emitted by beginCheckout server action after pending order creation'),
  ('purchase',         'derived', '[]'::jsonb,
   'DERIVED: orders.paid_at set inside the verified Cardcom webhook transaction'),
  ('refund',           'derived', '[]'::jsonb,
   'DERIVED: payments row kind=refund, status=succeeded'),
  ('wallet_earn',      'derived', '[]'::jsonb,
   'DERIVED: wallet_transactions crediting a user account'),
  ('wallet_spend',     'derived', '[]'::jsonb,
   'DERIVED: wallet_transactions debiting a user account'),
  ('coupon_scan',      'derived', '[]'::jsonb,
   'DERIVED: voucher_redemptions (every attempt incl. failures)'),
  ('search',           'derived', '[]'::jsonb,
   'DERIVED: search_events, incl. zero-result rows')
ON CONFLICT (event_name) DO NOTHING;

ALTER TABLE public.analytics_event_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_event_definitions: admin all" ON public.analytics_event_definitions;
CREATE POLICY "analytics_event_definitions: admin all"
  ON public.analytics_event_definitions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===========================================================================
-- 3. Raw behavioral events (monthly partitions)
-- ===========================================================================
-- `source` is the platform axis (web / pwa / server). `source_app` is the
-- product axis (shop / delivery / taxi), added here in the CREATE rather than
-- in a later ALTER: 056 had to ALTER because 033 had already shipped, and this
-- table has never existed on this database.
CREATE TABLE IF NOT EXISTS public.analytics_events (
  event_id       uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_name     text        NOT NULL
                   REFERENCES public.analytics_event_definitions(event_name),
  schema_version smallint    NOT NULL DEFAULT 1,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  received_at    timestamptz NOT NULL DEFAULT now(),
  source         text        NOT NULL DEFAULT 'web'
                   CHECK (source IN ('web', 'pwa', 'server')),
  source_app     text        NOT NULL DEFAULT 'shop'
                   CHECK (source_app IN ('shop', 'delivery', 'taxi')),
  anonymous_id   text,                -- ke_session_id cookie (joins carts.session_id)
  session_id     text,                -- rolling 30-minute client session
  user_id        uuid,                -- no FK on purpose: cheap partitions; the
                                      -- account-deletion job nulls it by index
  path           text,
  referrer       text,
  utm            jsonb,
  props          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_trunc       text,                -- truncated /24 (v4) or /48 (v6), never full IP
  user_agent     text,
  is_bot         boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (occurred_at, event_id) -- partition key first; doubles as dedupe
) PARTITION BY RANGE (occurred_at);

-- Idempotence for the case where a partial run created the table without them.
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

COMMENT ON TABLE public.analytics_events IS
  'Behavioral events only (client + server actions). NEVER sum money from this table: revenue lives in orders/order_items/payments/wallet_transactions. Monthly UTC partitions, 13-month retention.';
COMMENT ON COLUMN public.analytics_events.source_app IS
  'Product vertical (shop / delivery / taxi). Orthogonal to source (platform). Ingest whitelists shop only for now; adding a vertical is a CREATE OR REPLACE on fn_ingest_analytics_events, never a table migration.';

-- Partitioned indexes (cascade to every partition, existing and future)
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_time
  ON public.analytics_events (event_name, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON public.analytics_events (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user
  ON public.analytics_events (user_id, occurred_at) WHERE user_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_events: admin read" ON public.analytics_events;
CREATE POLICY "analytics_events: admin read"
  ON public.analytics_events
  FOR SELECT USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policies: only fn_ingest_analytics_events (definer)
-- and the account-deletion job (service role) touch this table.

-- Safety-net partition. Must stay empty in practice: ingest clamps occurred_at
-- into [now-7d, now+5m] and fn_ensure_analytics_partitions keeps
-- [prev month .. +2 months] created, so real events always hit a real partition.
-- NOTE: a row sitting in DEFAULT for a month that is later created as a
-- partition makes that CREATE fail; keep it clean.
CREATE TABLE IF NOT EXISTS public.analytics_events_default
  PARTITION OF public.analytics_events DEFAULT;
ALTER TABLE public.analytics_events_default ENABLE ROW LEVEL SECURITY;

-- Creates [current-1 .. current+p_months_ahead] monthly partitions (UTC months)
-- and enables RLS on each (a partition is a standalone table for PostgREST).
CREATE OR REPLACE FUNCTION public.fn_ensure_analytics_partitions(p_months_ahead int DEFAULT 2)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_month   date;
  v_name    text;
  v_created int := 0;
  i         int;
BEGIN
  IF auth.role() IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'fn_ensure_analytics_partitions: admin or service role only';
  END IF;

  FOR i IN -1..GREATEST(p_months_ahead, 0) LOOP
    v_month := (date_trunc('month', now()) + make_interval(months => i))::date;
    v_name  := 'analytics_events_' || to_char(v_month, 'YYYYMM');
    IF to_regclass('public.' || v_name) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.analytics_events FOR VALUES FROM (%L) TO (%L)',
        v_name, v_month, (v_month + interval '1 month')::date);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_name);
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN v_created;
END;
$$;

-- Drops monthly partitions older than p_keep_months (raw retention).
-- analytics_daily has already preserved the aggregates by then.
CREATE OR REPLACE FUNCTION public.fn_drop_old_analytics_partitions(p_keep_months int DEFAULT 13)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r         record;
  v_cutoff  date := (date_trunc('month', now()) - make_interval(months => p_keep_months))::date;
  v_dropped int  := 0;
BEGIN
  IF auth.role() IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'fn_drop_old_analytics_partitions: admin or service role only';
  END IF;

  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = p.relnamespace
    WHERE n.nspname = 'public'
      AND p.relname = 'analytics_events'
      AND c.relname ~ '^analytics_events_[0-9]{6}$'
  LOOP
    IF to_date(right(r.relname, 6), 'YYYYMM') < v_cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS public.%I', r.relname);
      v_dropped := v_dropped + 1;
    END IF;
  END LOOP;

  RETURN v_dropped;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ensure_analytics_partitions(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_drop_old_analytics_partitions(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_analytics_partitions(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_drop_old_analytics_partitions(int) TO service_role;

-- Initial partitions (idempotent; runs as migration owner, the guard allows it)
DO $$
BEGIN
  PERFORM public.fn_ensure_analytics_partitions(2);
END $$;

-- ===========================================================================
-- 4. Daily rollup (survives raw-partition drops; kept forever)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  day_il          date        NOT NULL,   -- Israel business day (fn_il_date)
  source_app      text        NOT NULL DEFAULT 'shop',
  event_name      text        NOT NULL,
  source          text        NOT NULL,
  events_count    int         NOT NULL DEFAULT 0,
  unique_sessions int         NOT NULL DEFAULT 0,
  unique_users    int         NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_il, source_app, event_name, source)
);

-- Idempotence for a partial run that created 033's three-column key.
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

ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_daily: admin read" ON public.analytics_daily;
CREATE POLICY "analytics_daily: admin read"
  ON public.analytics_daily
  FOR SELECT USING (public.is_admin());
-- Writes only via fn_rollup_analytics_daily (definer).

-- ===========================================================================
-- 5. Guest -> logged-in stitching
-- ===========================================================================
-- Written server-side only, once per (anonymous_id, user_id) pair, at login and
-- again inside beginCheckout (belt and braces). Attribution of pre-login events
-- happens at QUERY time: a wide UPDATE across partitions is exactly what
-- partitioning exists to avoid.
CREATE TABLE IF NOT EXISTS public.analytics_identity_links (
  anonymous_id text        NOT NULL,
  user_id      uuid        NOT NULL,
  linked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anonymous_id, user_id)
);

COMMENT ON TABLE public.analytics_identity_links IS
  'Maps a guest anonymous_id (ke_session_id cookie) to the user who later logged in. Query-time stitching for funnels. Deleted together with the account by the deletion job.';

-- The account-deletion job sweeps by user_id.
CREATE INDEX IF NOT EXISTS idx_analytics_identity_links_user
  ON public.analytics_identity_links (user_id);

ALTER TABLE public.analytics_identity_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_identity_links: admin read" ON public.analytics_identity_links;
CREATE POLICY "analytics_identity_links: admin read"
  ON public.analytics_identity_links
  FOR SELECT USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policies: service role only.

-- ===========================================================================
-- 6. Ingest (the only write path into analytics_events)
-- ===========================================================================
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

      -- Only 'shop' ships today. A mislabeled event is still a real event, so
      -- an unknown vertical is coerced rather than dropped.
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

-- ===========================================================================
-- 7. Rollup
-- ===========================================================================
-- Excludes bots and staff traffic (admin / super_admin / content_uploader
-- browsing their own store).
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

-- ===========================================================================
-- 8. orders.attribution
-- ===========================================================================
-- 033 section 6. `stampOrderAttribution` (src/server/analytics/track.ts:122)
-- writes it once, at checkout, and never again: the UPDATE carries
-- `.is('attribution', null)`. A report of last October must not move because
-- the customer clicked a new campaign in March.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS attribution jsonb;

COMMENT ON COLUMN public.orders.attribution IS
  'Marketing attribution snapshot written by beginCheckout from the 30-day attribution cookie: {first: {utm_source, utm_medium, utm_campaign, referrer, landing_path, at}, last: {...}}. Never updated after it is set.';

-- v_funnel_daily counts purchases by paid_at; the funnel query is a per-day
-- correlated subquery over this index.
CREATE INDEX IF NOT EXISTS idx_orders_paid_at
  ON public.orders (paid_at) WHERE paid_at IS NOT NULL;

-- ===========================================================================
-- 9. v_funnel_daily
-- ===========================================================================
-- The one analytics view this application reads
-- (src/server/analytics/queries.ts:136). Behavioral steps come from the rollup;
-- purchases come from the money truth table, never from analytics_events.
-- Step-to-step conversion percentages are computed in the presentation layer:
-- one raw number here, many ratios there.
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
  'Daily behavioral funnel from the rollup, joined to purchases from the money truth table. security_invoker: it is read server-side with the service client after requireAdminSession, and must never widen access on its own.';

COMMIT;

-- ===========================================================================
-- AFTER APPLYING: two things that are NOT part of this file
-- ===========================================================================
--
-- 1. NOTHING SCHEDULES THE ROLLUP. `fn_rollup_analytics_daily` is granted to
--    service_role and called by nobody: `grep -rn fn_rollup_analytics_daily src/`
--    returns no hits, and `vercel.json` has no cron for it. Until something
--    calls it once a day, `analytics_daily` stays empty and `v_funnel_daily`
--    returns zero rows even with ingest working perfectly. The same is true of
--    `fn_ensure_analytics_partitions`: this file creates partitions through
--    two months out, and in three months the DEFAULT partition starts
--    collecting rows unless it is called again.
--
--    That wiring is a code change (a cron route plus an entry in vercel.json),
--    which is why it is not in a DDL file. It is the immediate next step.
--
-- 2. Verification query, read-only, after apply:
--
--    SELECT 'defs' t, count(*)::text v FROM public.analytics_event_definitions
--    UNION ALL SELECT 'partitions', count(*)::text FROM pg_inherits i
--      JOIN pg_class c ON c.oid = i.inhrelid
--      JOIN pg_class p ON p.oid = i.inhparent
--      WHERE p.relname = 'analytics_events'
--    UNION ALL SELECT 'funnel rows', count(*)::text FROM public.v_funnel_daily
--    UNION ALL SELECT 'orders.attribution', (
--      SELECT count(*)::text FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='orders' AND column_name='attribution');
--
--    Expected: defs = 14, partitions = 5 (default + prev + current + 2 ahead),
--    funnel rows = 0, orders.attribution = 1.
