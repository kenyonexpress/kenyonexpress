-- ===========================================================================
-- 033_analytics.sql  (DRAFT, NOT APPLIED)
-- Analytics & BI domain: first-party event collection, daily rollups,
-- owner dashboard views. Design doc: docs/ARCHITECTURE-ANALYTICS-BI.md
--
-- HARD PREREQUISITES (checked below, migration aborts if missing):
--   026_commerce.sql  : order_items snapshot columns, payments, wallet_accounts
--   027_suppliers.sql : coupon_codes snapshot columns, coupon_scan_events,
--                       supplier_disputes
--   (plus live baseline: 011/025 audit_log_trigger_fn, 003 is_admin/user_role)
-- OPTIONAL (views created only if present):
--   030_catalog.sql   : search_queries -> v_search_quality_daily
--
-- Numbering note: 032 is taken by 032_wp_import_staging.sql (WP import).
-- The vendors -> suppliers unification is planned as 036_vendors_unification.sql
-- (MASTER-ARCHITECTURE v2 section 2.9). This domain takes 033 (BI extension is
-- 034, security hardening is 035). No dependency on 028-032.
--
-- Apply ONLY via Supabase MCP apply_migration (never db push), after 026+027.
-- Every statement is idempotent; the whole file is one transaction.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Prerequisite guard (fail fast, same pattern as 031)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items'
      AND column_name = 'platform_fee_ils'
  ) THEN
    RAISE EXCEPTION '033_analytics requires 026_commerce (order_items.platform_fee_ils missing)';
  END IF;

  IF to_regclass('public.payments') IS NULL
     OR to_regclass('public.wallet_accounts') IS NULL THEN
    RAISE EXCEPTION '033_analytics requires 026_commerce (payments / wallet_accounts missing)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupon_codes'
      AND column_name = 'collect_amount_ils'
  ) THEN
    RAISE EXCEPTION '033_analytics requires 027_suppliers (coupon_codes.collect_amount_ils missing)';
  END IF;

  IF to_regclass('public.coupon_scan_events') IS NULL THEN
    RAISE EXCEPTION '033_analytics requires 027_suppliers (coupon_scan_events missing)';
  END IF;

  IF to_regproc('public.audit_log_trigger_fn') IS NULL THEN
    RAISE EXCEPTION '033_analytics requires 025_consolidation (audit_log_trigger_fn missing)';
  END IF;
END $$;

-- Defensive re-assert (repo convention: 001 may stop early on a live DB)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 2. Event registry (the taxonomy source of truth)
-- ---------------------------------------------------------------------------
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
  'Canonical event taxonomy. Ingest rejects events not registered here. origin=derived events are NEVER written to analytics_events; they live in their source-of-truth tables (orders, payments, coupon_scan_events, wallet_transactions, search_queries).';

DROP TRIGGER IF EXISTS set_updated_at ON public.analytics_event_definitions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.analytics_event_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_analytics_event_definitions ON public.analytics_event_definitions;
CREATE TRIGGER audit_analytics_event_definitions
  AFTER INSERT OR UPDATE OR DELETE ON public.analytics_event_definitions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger_fn();

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
  ('begin_checkout',   'server',  '["order_id","items_count"]'::jsonb,
   'Emitted by beginCheckout server action after pending order creation'),
  ('purchase',         'derived', '[]'::jsonb,
   'DERIVED: orders.paid_at set inside the verified Cardcom webhook transaction'),
  ('refund',           'derived', '[]'::jsonb,
   'DERIVED: payments row kind=refund, status=succeeded'),
  ('coupon_scan',      'derived', '[]'::jsonb,
   'DERIVED: coupon_scan_events (every attempt incl. failures)'),
  ('wallet_earn',      'derived', '[]'::jsonb,
   'DERIVED: wallet_transactions crediting a user account'),
  ('wallet_spend',     'derived', '[]'::jsonb,
   'DERIVED: wallet_transactions debiting a user account'),
  ('search',           'derived', '[]'::jsonb,
   'DERIVED: search_queries (030), incl. zero-result rows')
ON CONFLICT (event_name) DO NOTHING;

ALTER TABLE public.analytics_event_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_event_definitions: admin all" ON public.analytics_event_definitions;
CREATE POLICY "analytics_event_definitions: admin all"
  ON public.analytics_event_definitions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Raw behavioral events (monthly partitions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  event_id       uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_name     text        NOT NULL
                   REFERENCES public.analytics_event_definitions(event_name),
  schema_version smallint    NOT NULL DEFAULT 1,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  received_at    timestamptz NOT NULL DEFAULT now(),
  source         text        NOT NULL DEFAULT 'web'
                   CHECK (source IN ('web', 'pwa', 'server')),
  anonymous_id   text,                -- ke_session_id cookie (joins carts.session_id)
  session_id     text,                -- rolling 30-minute client session
  user_id        uuid,                -- no FK on purpose: cheap partitions; account
                                      -- deletion job (029) nulls it by index
  path           text,
  referrer       text,
  utm            jsonb,
  props          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_trunc       text,                -- truncated /24 (v4) or /48 (v6), never full IP
  user_agent     text,
  is_bot         boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (occurred_at, event_id) -- partition key first; doubles as dedupe
) PARTITION BY RANGE (occurred_at);

COMMENT ON TABLE public.analytics_events IS
  'Behavioral events only (client + server actions). NEVER sum money from this table: revenue lives in orders/order_items/payments/wallet_transactions. Monthly UTC partitions, 13-month retention.';

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
-- Rows here are surfaced by v_money_alarms. NOTE: a row sitting in DEFAULT for a
-- month that is later created as a partition makes that CREATE fail; keep it clean.
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

-- Initial partitions (idempotent; runs as migration owner, guard allows it)
DO $$
BEGIN
  PERFORM public.fn_ensure_analytics_partitions(2);
END $$;

-- ---------------------------------------------------------------------------
-- 4. Ingest (the only write path)
-- ---------------------------------------------------------------------------
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

      v_event_id := COALESCE(NULLIF(v_el->>'event_id', '')::uuid, gen_random_uuid());

      INSERT INTO public.analytics_events (
        event_id, event_name, schema_version, occurred_at, source,
        anonymous_id, session_id, user_id, path, referrer, utm, props,
        ip_trunc, user_agent, is_bot
      ) VALUES (
        v_event_id,
        v_def.event_name,
        v_def.schema_version,          -- server-authoritative, never from client
        v_occurred_at,
        v_source,
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

-- ---------------------------------------------------------------------------
-- 5. Daily rollup (survives raw-partition drops; kept forever)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  day_il          date        NOT NULL,   -- Israel business day (fn_il_date)
  event_name      text        NOT NULL,
  source          text        NOT NULL,
  events_count    int         NOT NULL DEFAULT 0,
  unique_sessions int         NOT NULL DEFAULT 0,
  unique_users    int         NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_il, event_name, source)
);

ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_daily: admin read" ON public.analytics_daily;
CREATE POLICY "analytics_daily: admin read"
  ON public.analytics_daily
  FOR SELECT USING (public.is_admin());
-- Writes only via fn_rollup_analytics_daily (definer).

-- Rebuilds one Israel business day. Excludes bots and staff traffic
-- (admin / super_admin / content_uploader browsing their own store).
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
    (day_il, event_name, source, events_count, unique_sessions, unique_users)
  SELECT
    v_day,
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
  GROUP BY ae.event_name, ae.source;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_rollup_analytics_daily(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rollup_analytics_daily(date) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Channel attribution on orders (written once by beginCheckout)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS attribution jsonb;

COMMENT ON COLUMN public.orders.attribution IS
  'Marketing attribution snapshot written by beginCheckout from the 30-day attribution cookie: {first: {utm_source, utm_medium, utm_campaign, referrer, landing_path, at}, last: {...}}. Never updated after paid. Notification attribution lives in notification_conversions (031), not here.';

-- ---------------------------------------------------------------------------
-- 7. Reporting helper indexes on money tables
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_paid_at
  ON public.orders (paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupon_codes_status_created
  ON public.coupon_codes (status, created_at);
CREATE INDEX IF NOT EXISTS idx_coupon_scan_events_created
  ON public.coupon_scan_events (created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created
  ON public.wallet_transactions (created_at);

-- ---------------------------------------------------------------------------
-- 8. Views (all security_invoker; read them server-side with the service
--    client after requireAdminSession, see doc section 4.1)
-- ---------------------------------------------------------------------------

-- 8.1 Revenue per Israel business day (paid orders; refunds are separate)
CREATE OR REPLACE VIEW public.v_revenue_daily
WITH (security_invoker = true) AS
SELECT
  public.fn_il_date(o.paid_at)              AS day_il,
  count(DISTINCT o.id)                      AS paid_orders,
  sum(oi.total_price_ils)                   AS gmv_ils,
  sum(oi.charged_on_site_ils)               AS charged_on_site_ils,
  sum(oi.platform_fee_ils)                  AS platform_revenue_ils,
  sum(oi.supplier_due_ils)                  AS supplier_due_ils,
  sum(oi.cashback_earned_ils)               AS cashback_granted_ils
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.paid_at IS NOT NULL
  AND o.deleted_at IS NULL
  AND oi.deleted_at IS NULL
GROUP BY 1;

-- 8.2 Refunds per day (negative line on refund day; sale days never rewritten)
CREATE OR REPLACE VIEW public.v_refunds_daily
WITH (security_invoker = true) AS
SELECT
  public.fn_il_date(COALESCE(p.succeeded_at, p.created_at)) AS day_il,
  count(*)                                                  AS refunds,
  sum(p.amount_ils)                                         AS refunded_ils
FROM public.payments p
WHERE p.kind = 'refund'::public.payment_kind
  AND p.status = 'succeeded'::public.payment_status
GROUP BY 1;

-- 8.3 Wallet liability (real debt to customers, right now)
CREATE OR REPLACE VIEW public.v_wallet_liability
WITH (security_invoker = true) AS
SELECT
  COALESCE(sum(balance_ils), 0)             AS outstanding_cashback_ils,
  count(*) FILTER (WHERE balance_ils > 0)   AS users_with_balance,
  COALESCE(max(updated_at), now())          AS as_of
FROM public.wallet_accounts
WHERE owner_type = 'user';

-- 8.4 Cached balance vs ledger-derived balance. Any row = bug or manual
-- intervention. Correct only if 026 seeds legacy balances as opening ledger
-- entries (manual_adjust from platform:adjustments), see doc section 3.5.
CREATE OR REPLACE VIEW public.v_wallet_ledger_drift
WITH (security_invoker = true) AS
WITH ledger AS (
  SELECT account_id, sum(delta) AS ledger_balance
  FROM (
    SELECT credit_account_id AS account_id, amount_ils  AS delta
    FROM public.wallet_transactions
    UNION ALL
    SELECT debit_account_id  AS account_id, -amount_ils AS delta
    FROM public.wallet_transactions
  ) t
  GROUP BY account_id
)
SELECT
  a.id AS account_id,
  a.owner_type,
  a.user_id,
  a.code,
  a.balance_ils,
  COALESCE(l.ledger_balance, 0)                 AS ledger_balance,
  a.balance_ils - COALESCE(l.ledger_balance, 0) AS drift_ils
FROM public.wallet_accounts a
LEFT JOIN ledger l ON l.account_id = a.id
WHERE a.balance_ils <> COALESCE(l.ledger_balance, 0);

-- 8.5 Coupon funnel by issue month (issued = paid moment by design)
CREATE OR REPLACE VIEW public.v_coupon_funnel_monthly
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', (cc.created_at AT TIME ZONE 'Asia/Jerusalem'))::date AS issue_month,
  count(*)                                                                 AS issued,
  count(*) FILTER (WHERE cc.status = 'used'::public.coupon_status)         AS scanned,
  count(*) FILTER (WHERE cc.status = 'expired'::public.coupon_status)      AS expired,
  count(*) FILTER (WHERE cc.status = 'refunded'::public.coupon_status)     AS refunded,
  count(*) FILTER (WHERE cc.status = 'issued'::public.coupon_status)       AS outstanding,
  round(100.0 * count(*) FILTER (WHERE cc.status = 'used'::public.coupon_status)
    / NULLIF(count(*) FILTER (WHERE cc.status IN
        ('used'::public.coupon_status, 'expired'::public.coupon_status)), 0), 1)
                                                                           AS scan_rate_pct,
  COALESCE(sum(cc.platform_paid_ils), 0)                                   AS platform_paid_ils,
  COALESCE(sum(cc.platform_paid_ils)
    FILTER (WHERE cc.status = 'issued'::public.coupon_status), 0)          AS outstanding_platform_paid_ils,
  COALESCE(sum(cc.collect_amount_ils)
    FILTER (WHERE cc.status = 'issued'::public.coupon_status), 0)          AS outstanding_collect_ils,
  round((percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch FROM cc.used_at - cc.created_at) / 86400.0)
    FILTER (WHERE cc.used_at IS NOT NULL))::numeric, 1)                    AS median_days_to_scan
FROM public.coupon_codes cc
WHERE cc.deleted_at IS NULL
GROUP BY 1;

-- 8.6 Supplier leaderboard, trailing 30 days
CREATE OR REPLACE VIEW public.v_supplier_leaderboard_30d
WITH (security_invoker = true) AS
SELECT
  s.id                                AS supplier_id,
  s.name,
  COALESCE(rev.items_sold, 0)         AS items_sold_30d,
  COALESCE(rev.gmv_ils, 0)            AS gmv_ils_30d,
  COALESCE(rev.platform_fee_ils, 0)   AS platform_revenue_ils_30d,
  COALESCE(sc.success_scans, 0)       AS success_scans_30d,
  COALESCE(sc.failed_scans, 0)        AS failed_scans_30d,
  COALESCE(sc.wrong_supplier_scans, 0) AS wrong_supplier_scans_30d,
  cc.scan_rate_90d_pct,
  COALESCE(d.open_disputes, 0)        AS open_disputes
FROM public.suppliers s
LEFT JOIN (
  SELECT oi.supplier_id,
         count(*)                    AS items_sold,
         sum(oi.total_price_ils)     AS gmv_ils,
         sum(oi.platform_fee_ils)    AS platform_fee_ils
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.paid_at >= now() - interval '30 days'
    AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
  GROUP BY oi.supplier_id
) rev ON rev.supplier_id = s.id
LEFT JOIN (
  SELECT cse.supplier_id,
         count(*) FILTER (WHERE cse.result = 'success'::public.scan_result)        AS success_scans,
         count(*) FILTER (WHERE cse.result <> 'success'::public.scan_result)       AS failed_scans,
         count(*) FILTER (WHERE cse.result = 'wrong_supplier'::public.scan_result) AS wrong_supplier_scans
  FROM public.coupon_scan_events cse
  WHERE cse.created_at >= now() - interval '30 days'
  GROUP BY cse.supplier_id
) sc ON sc.supplier_id = s.id
LEFT JOIN (
  SELECT c.supplier_id,
         round(100.0 * count(*) FILTER (WHERE c.status = 'used'::public.coupon_status)
           / NULLIF(count(*) FILTER (WHERE c.status IN
               ('used'::public.coupon_status, 'expired'::public.coupon_status)), 0), 1)
           AS scan_rate_90d_pct
  FROM public.coupon_codes c
  WHERE c.created_at >= now() - interval '90 days' AND c.deleted_at IS NULL
  GROUP BY c.supplier_id
) cc ON cc.supplier_id = s.id
LEFT JOIN (
  SELECT sd.supplier_id, count(*) AS open_disputes
  FROM public.supplier_disputes sd
  WHERE sd.status IN ('open'::public.dispute_status, 'in_review'::public.dispute_status)
  GROUP BY sd.supplier_id
) d ON d.supplier_id = s.id;

-- 8.7 Cohort LTV: first-paid-order month cohorts, platform revenue per member
CREATE OR REPLACE VIEW public.v_cohort_ltv_monthly
WITH (security_invoker = true) AS
WITH cohort AS (
  SELECT o.user_id, min(o.paid_at) AS first_paid_at
  FROM public.orders o
  WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL
  GROUP BY o.user_id
),
sizes AS (
  SELECT date_trunc('month', (c.first_paid_at AT TIME ZONE 'Asia/Jerusalem'))::date AS cohort_month,
         count(*) AS cohort_size
  FROM cohort c
  GROUP BY 1
)
SELECT
  sz.cohort_month,
  sz.cohort_size,
  ((extract(year  FROM (o.paid_at AT TIME ZONE 'Asia/Jerusalem'))
  - extract(year  FROM (c.first_paid_at AT TIME ZONE 'Asia/Jerusalem'))) * 12
  + extract(month FROM (o.paid_at AT TIME ZONE 'Asia/Jerusalem'))
  - extract(month FROM (c.first_paid_at AT TIME ZONE 'Asia/Jerusalem')))::int AS month_offset,
  count(DISTINCT o.user_id)                            AS active_buyers,
  sum(oi.platform_fee_ils)                             AS platform_revenue_ils,
  round(sum(oi.platform_fee_ils) / sz.cohort_size, 2)  AS revenue_per_cohort_user_ils
FROM public.orders o
JOIN cohort c  ON c.user_id = o.user_id
JOIN sizes  sz ON sz.cohort_month =
  date_trunc('month', (c.first_paid_at AT TIME ZONE 'Asia/Jerusalem'))::date
JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
GROUP BY sz.cohort_month, sz.cohort_size, month_offset;

-- 8.8 Revenue by channel (orders.attribution, last-touch), weekly
CREATE OR REPLACE VIEW public.v_channel_revenue_weekly
WITH (security_invoker = true) AS
SELECT
  date_trunc('week', (o.paid_at AT TIME ZONE 'Asia/Jerusalem'))::date AS week_start,
  COALESCE(o.attribution #>> '{last,utm_source}', '(direct)')         AS utm_source,
  COALESCE(o.attribution #>> '{last,utm_campaign}', '(none)')         AS utm_campaign,
  count(DISTINCT o.id)                                                AS orders,
  sum(oi.total_price_ils)                                             AS gmv_ils,
  sum(oi.platform_fee_ils)                                            AS platform_revenue_ils
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
GROUP BY 1, 2, 3;

-- 8.9 Daily behavioral funnel (rollup) joined to truth-table purchases
CREATE OR REPLACE VIEW public.v_funnel_daily
WITH (security_invoker = true) AS
SELECT
  ad.day_il,
  COALESCE(sum(ad.unique_sessions) FILTER (WHERE ad.event_name = 'page_view'), 0)    AS sessions,
  COALESCE(sum(ad.events_count)    FILTER (WHERE ad.event_name = 'view_product'), 0) AS product_views,
  COALESCE(sum(ad.events_count)    FILTER (WHERE ad.event_name = 'add_to_cart'), 0)  AS add_to_carts,
  COALESCE(sum(ad.events_count)    FILTER (WHERE ad.event_name = 'begin_checkout'), 0) AS checkouts,
  (SELECT count(*) FROM public.orders o
    WHERE o.paid_at IS NOT NULL AND public.fn_il_date(o.paid_at) = ad.day_il)        AS purchases
FROM public.analytics_daily ad
GROUP BY ad.day_il;

-- 8.10 Money alarms: every row is a problem to handle TODAY
CREATE OR REPLACE VIEW public.v_money_alarms
WITH (security_invoker = true) AS
SELECT 'failed_payments_24h' AS alarm, count(*)::int AS n
FROM public.payments
WHERE status = 'failed'::public.payment_status
  AND created_at >= now() - interval '24 hours'
HAVING count(*) > 0
UNION ALL
SELECT 'invalid_webhook_signatures_24h', count(*)::int
FROM public.payment_webhook_events
WHERE signature_valid = false
  AND received_at >= now() - interval '24 hours'
HAVING count(*) > 0
UNION ALL
SELECT 'payments_stuck_redirected_10m', count(*)::int
FROM public.payments
WHERE status = 'redirected'::public.payment_status
  AND created_at < now() - interval '10 minutes'
HAVING count(*) > 0
UNION ALL
SELECT 'pending_orders_past_expiry_1h', count(*)::int
FROM public.orders
WHERE status = 'pending'::public.order_status
  AND expires_at IS NOT NULL
  AND expires_at < now() - interval '1 hour'
HAVING count(*) > 0
UNION ALL
SELECT 'wallet_ledger_drift_accounts', count(*)::int
FROM public.v_wallet_ledger_drift
HAVING count(*) > 0
UNION ALL
SELECT 'analytics_default_partition_rows', count(*)::int
FROM public.analytics_events_default
HAVING count(*) > 0;

-- 8.11 The ONE owner dashboard (single row, read every morning)
CREATE OR REPLACE VIEW public.v_owner_dashboard
WITH (security_invoker = true) AS
SELECT
  public.fn_il_date(now()) AS day_il,

  -- money: today / yesterday / 7-day average
  (SELECT count(*) FROM public.orders o
    WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL
      AND public.fn_il_date(o.paid_at) = public.fn_il_date(now()))
    AS orders_today,
  (SELECT COALESCE(sum(oi.total_price_ils), 0)
   FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
     AND public.fn_il_date(o.paid_at) = public.fn_il_date(now()))
    AS gmv_today_ils,
  (SELECT COALESCE(sum(oi.charged_on_site_ils), 0)
   FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
     AND public.fn_il_date(o.paid_at) = public.fn_il_date(now()))
    AS charged_on_site_today_ils,
  (SELECT COALESCE(sum(oi.platform_fee_ils), 0)
   FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
     AND public.fn_il_date(o.paid_at) = public.fn_il_date(now()))
    AS platform_revenue_today_ils,
  (SELECT COALESCE(sum(oi.platform_fee_ils), 0)
   FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
     AND public.fn_il_date(o.paid_at) = public.fn_il_date(now()) - 1)
    AS platform_revenue_yesterday_ils,
  (SELECT round(COALESCE(sum(oi.platform_fee_ils), 0) / 7, 2)
   FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
     AND public.fn_il_date(o.paid_at)
         BETWEEN public.fn_il_date(now()) - 7 AND public.fn_il_date(now()) - 1)
    AS platform_revenue_7d_avg_ils,
  (SELECT round(COALESCE(sum(oi.total_price_ils), 0)
          / NULLIF(count(DISTINCT o.id), 0), 2)
   FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
     AND public.fn_il_date(o.paid_at) = public.fn_il_date(now()))
    AS aov_today_ils,
  (SELECT COALESCE(sum(p.amount_ils), 0)
   FROM public.payments p
   WHERE p.kind = 'refund'::public.payment_kind
     AND p.status = 'succeeded'::public.payment_status
     AND public.fn_il_date(COALESCE(p.succeeded_at, p.created_at)) = public.fn_il_date(now()))
    AS refunds_today_ils,

  -- customers
  (SELECT count(*)
   FROM (SELECT o.user_id, min(o.paid_at) AS first_paid
         FROM public.orders o
         WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL
         GROUP BY o.user_id) f
   WHERE public.fn_il_date(f.first_paid) = public.fn_il_date(now()))
    AS new_customers_today,

  -- coupons
  (SELECT count(*) FROM public.coupon_scan_events cse
    WHERE cse.result = 'success'::public.scan_result
      AND public.fn_il_date(cse.created_at) = public.fn_il_date(now()))
    AS coupons_scanned_today,
  (SELECT count(*) FROM public.coupon_scan_events cse
    WHERE cse.result <> 'success'::public.scan_result
      AND public.fn_il_date(cse.created_at) = public.fn_il_date(now()))
    AS scan_failures_today,
  (SELECT count(*) FROM public.coupon_codes cc
    WHERE cc.status = 'issued'::public.coupon_status AND cc.deleted_at IS NULL)
    AS coupons_outstanding,
  (SELECT COALESCE(sum(cc.platform_paid_ils), 0) FROM public.coupon_codes cc
    WHERE cc.status = 'issued'::public.coupon_status AND cc.deleted_at IS NULL)
    AS coupons_outstanding_platform_paid_ils,
  (SELECT COALESCE(sum(cc.collect_amount_ils), 0) FROM public.coupon_codes cc
    WHERE cc.status = 'issued'::public.coupon_status AND cc.deleted_at IS NULL)
    AS coupons_outstanding_collect_ils,
  (SELECT round(100.0 * count(*) FILTER (WHERE cc.status = 'used'::public.coupon_status)
          / NULLIF(count(*), 0), 1)
   FROM public.coupon_codes cc
   WHERE cc.status IN ('used'::public.coupon_status, 'expired'::public.coupon_status)
     AND cc.updated_at >= now() - interval '30 days')
    AS scan_rate_30d_pct,

  -- wallet
  (SELECT COALESCE(sum(wa.balance_ils), 0) FROM public.wallet_accounts wa
    WHERE wa.owner_type = 'user')
    AS wallet_liability_ils,
  (SELECT COALESCE(sum(oi.cashback_earned_ils), 0)
   FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
     AND public.fn_il_date(o.paid_at) = public.fn_il_date(now()))
    AS cashback_granted_today_ils,

  -- demand signals
  (SELECT count(*) FROM public.carts c
    WHERE c.profile_id IS NOT NULL
      AND jsonb_array_length(COALESCE(c.items, '[]'::jsonb)) > 0
      AND c.updated_at BETWEEN now() - interval '72 hours' AND now() - interval '1 hour'
      AND NOT EXISTS (SELECT 1 FROM public.orders o
                      WHERE o.user_id = c.profile_id AND o.paid_at > c.updated_at))
    AS abandoned_carts_open,
  (SELECT count(DISTINCT ae.session_id) FROM public.analytics_events ae
    WHERE ae.occurred_at >= (public.fn_il_date(now())::timestamp AT TIME ZONE 'Asia/Jerusalem')
      AND NOT ae.is_bot)
    AS sessions_today,

  -- alarms rollup
  (SELECT count(*) FROM public.v_money_alarms)
    AS active_alarms;

-- ---------------------------------------------------------------------------
-- 9. Conditional views (only when the optional domain is applied)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  -- 030_catalog: search quality
  IF to_regclass('public.search_queries') IS NOT NULL THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW public.v_search_quality_daily
      WITH (security_invoker = true) AS
      SELECT
        public.fn_il_date(sq.created_at)                    AS day_il,
        count(*)                                            AS searches,
        count(*) FILTER (WHERE sq.results_count = 0)        AS zero_results,
        round(100.0 * count(*) FILTER (WHERE sq.results_count = 0)
          / NULLIF(count(*), 0), 1)                         AS zero_rate_pct,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY sq.took_ms) AS p95_took_ms
      FROM public.search_queries sq
      GROUP BY 1
    $v$;
  END IF;
END $do$;

-- ===========================================================================
-- NOT in 033 (deliberately):
--   * application code: client SDK, /api/a route, consent banner, dashboard UI,
--     begin_checkout emission + orders.attribution write inside beginCheckout
--   * cron scheduling (pg_cron: nightly fn_rollup_analytics_daily, monthly
--     fn_ensure_analytics_partitions + fn_drop_old_analytics_partitions;
--     Vercel cron: v_money_alarms alerting)
--   * purge jobs for coupon_scan_events (90d) / search_queries (6mo): owned by
--     their domains (PRODUCTION-OPS / 030)
--   * any change to migrations 026-031 (but see doc 3.5: 026's legacy wallet
--     balance copy must become opening ledger entries before it is applied,
--     otherwise v_wallet_ledger_drift flags every migrated account)
-- ===========================================================================
