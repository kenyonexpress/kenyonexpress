-- ===========================================================================
-- 035_analytics_bi.sql  (DRAFT, NOT APPLIED)
-- Analytics & BI extension layer on top of 033_analytics:
--   * supplier-facing, RLS-scoped dashboard views (portal)
--   * admin BI: take-rate by platform_percent, cohort retention (matview),
--     coupon expiry liability report
--   * materialized views + refresh function (nightly, pg_cron)
--   * AI-agent integration surface: fn_agent_kpi_snapshot, v_agent_costs_daily
--   * event registry additions: coupon_redeemed, supplier_payout (derived)
-- Design doc: docs/ARCHITECTURE-ANALYTICS-BI.md
--
-- HARD PREREQUISITES (checked below, migration aborts if missing):
--   026_commerce.sql  : order_items snapshot columns
--   027_suppliers.sql : payout_statements, coupon_codes snapshot columns,
--                       is_supplier_member(), coupon_scan_events
--   033_analytics.sql : fn_il_date, analytics_event_definitions, v_money_alarms
-- OPTIONAL (objects created only if present):
--   028_agents.sql    : agent_runs -> v_agent_costs_daily
--
-- Numbering: 034 is reserved for 034_vendors_unification.sql
-- (MASTER-ARCHITECTURE decisions 1.19 / 1.38). This domain takes 035.
-- No dependency on 034: views read suppliers/order_items directly and pick up
-- unified rows automatically once 034 backfills them.
--
-- Apply ONLY via Supabase MCP apply_migration (never db push), after 033.
-- Every statement is idempotent; the whole file is one transaction.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Prerequisite guard (fail fast, same pattern as 031/033)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items'
      AND column_name = 'platform_fee_ils'
  ) THEN
    RAISE EXCEPTION '035_analytics_bi requires 026_commerce (order_items.platform_fee_ils missing)';
  END IF;

  IF to_regclass('public.payout_statements') IS NULL
     OR to_regclass('public.coupon_scan_events') IS NULL THEN
    RAISE EXCEPTION '035_analytics_bi requires 027_suppliers (payout_statements / coupon_scan_events missing)';
  END IF;

  IF to_regproc('public.is_supplier_member') IS NULL THEN
    RAISE EXCEPTION '035_analytics_bi requires 027_suppliers (is_supplier_member missing)';
  END IF;

  IF to_regproc('public.fn_il_date') IS NULL
     OR to_regclass('public.analytics_event_definitions') IS NULL THEN
    RAISE EXCEPTION '035_analytics_bi requires 033_analytics (fn_il_date / analytics_event_definitions missing)';
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
-- 1. Event registry additions (derived events; never written to
--    analytics_events, read from their source-of-truth tables)
-- ---------------------------------------------------------------------------
INSERT INTO public.analytics_event_definitions
  (event_name, origin, required_props, description)
VALUES
  ('coupon_redeemed', 'derived', '[]'::jsonb,
   'DERIVED: coupon_codes.used_at set by redeem_coupon() (successful in-store redemption only). Attempt-level detail incl. failures lives in coupon_scan (coupon_scan_events).'),
  ('supplier_payout', 'derived', '[]'::jsonb,
   'DERIVED: payout_statements transition to paid (paid_at, via mark_payout_statement_paid). Line-level money truth: payout_statement_lines.')
ON CONFLICT (event_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Reporting helper indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_coupon_codes_expiry_open
  ON public.coupon_codes (expires_at)
  WHERE status = 'issued'::public.coupon_status;

CREATE INDEX IF NOT EXISTS idx_coupon_codes_supplier_status
  ON public.coupon_codes (supplier_id, status);

CREATE INDEX IF NOT EXISTS idx_order_items_supplier
  ON public.order_items (supplier_id) WHERE supplier_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Supplier-facing views (portal). All security_invoker: RLS from
--    027 scopes every row to the caller's supplier membership
--    (is_supplier_member on order_items / coupon_codes / coupon_scan_events /
--    payout_statements). Admin JWTs see all suppliers through admin policies.
--    Read them client-side with the user's Supabase client, or server-side
--    with the user's session (NOT the service client).
-- ---------------------------------------------------------------------------

-- 3.1 Sales per Israel business day, per supplier
CREATE OR REPLACE VIEW public.v_supplier_sales_daily
WITH (security_invoker = true) AS
SELECT
  oi.supplier_id,
  public.fn_il_date(o.paid_at)              AS day_il,
  count(*)                                  AS items_sold,
  count(DISTINCT o.id)                      AS orders,
  sum(oi.total_price_ils)                   AS gmv_ils,
  sum(oi.charged_on_site_ils)               AS charged_on_site_ils,
  sum(oi.balance_due_at_business_ils)       AS collect_at_business_ils,
  sum(oi.platform_fee_ils)                  AS platform_fee_ils,
  sum(oi.supplier_due_ils)                  AS supplier_due_ils
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE o.paid_at IS NOT NULL
  AND o.deleted_at IS NULL
  AND oi.deleted_at IS NULL
  AND oi.supplier_id IS NOT NULL
GROUP BY 1, 2;

COMMENT ON VIEW public.v_supplier_sales_daily IS
  'Supplier portal: own paid sales per Israel business day. security_invoker; RLS (order_items_supplier_read + orders_supplier_read) scopes rows to the caller''s suppliers. All money from order-time snapshots.';

-- 3.2 Coupon redemption funnel per issue month, per supplier
CREATE OR REPLACE VIEW public.v_supplier_redemptions_monthly
WITH (security_invoker = true) AS
SELECT
  cc.supplier_id,
  date_trunc('month', (cc.created_at AT TIME ZONE 'Asia/Jerusalem'))::date AS issue_month,
  count(*)                                                                 AS issued,
  count(*) FILTER (WHERE cc.status = 'used'::public.coupon_status)         AS redeemed,
  count(*) FILTER (WHERE cc.status = 'expired'::public.coupon_status)      AS expired,
  count(*) FILTER (WHERE cc.status = 'refunded'::public.coupon_status)     AS refunded,
  count(*) FILTER (WHERE cc.status = 'issued'::public.coupon_status)       AS outstanding,
  round(100.0 * count(*) FILTER (WHERE cc.status = 'used'::public.coupon_status)
    / NULLIF(count(*) FILTER (WHERE cc.status IN
        ('used'::public.coupon_status, 'expired'::public.coupon_status)), 0), 1)
                                                                           AS redemption_rate_pct,
  COALESCE(sum(cc.face_value_ils), 0)                                      AS face_value_ils,
  COALESCE(sum(cc.collect_amount_ils)
    FILTER (WHERE cc.status = 'used'::public.coupon_status), 0)            AS collected_in_store_ils,
  COALESCE(sum(cc.collect_amount_ils)
    FILTER (WHERE cc.status = 'issued'::public.coupon_status), 0)          AS outstanding_collect_ils,
  round((percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch FROM cc.used_at - cc.created_at) / 86400.0)
    FILTER (WHERE cc.used_at IS NOT NULL))::numeric, 1)                    AS median_days_to_redeem
FROM public.coupon_codes cc
WHERE cc.deleted_at IS NULL
  AND cc.supplier_id IS NOT NULL
GROUP BY 1, 2;

COMMENT ON VIEW public.v_supplier_redemptions_monthly IS
  'Supplier portal: own coupon funnel per issue month. redemption_rate = used / (used + expired), final states only. outstanding_collect_ils = cash the business still expects to collect in-store.';

-- 3.3 Scan activity per day, per supplier (own scanner health)
CREATE OR REPLACE VIEW public.v_supplier_scans_daily
WITH (security_invoker = true) AS
SELECT
  cse.supplier_id,
  public.fn_il_date(cse.created_at)                                              AS day_il,
  count(*)                                                                       AS scan_attempts,
  count(*) FILTER (WHERE cse.result = 'success'::public.scan_result)             AS successes,
  count(*) FILTER (WHERE cse.result = 'already_used'::public.scan_result)        AS already_used,
  count(*) FILTER (WHERE cse.result = 'expired'::public.scan_result)             AS expired,
  count(*) FILTER (WHERE cse.result NOT IN ('success'::public.scan_result,
                                            'already_used'::public.scan_result,
                                            'expired'::public.scan_result))      AS other_failures
FROM public.coupon_scan_events cse
GROUP BY 1, 2;

COMMENT ON VIEW public.v_supplier_scans_daily IS
  'Supplier portal: own scan attempts per day. Persistent other_failures means a device / training problem at the business. Source retained 90 days (coupon_scan_events purge); money truth is coupon_codes.';

-- 3.4 Payout statements (non-draft; RLS hides drafts from members)
CREATE OR REPLACE VIEW public.v_supplier_payouts
WITH (security_invoker = true) AS
SELECT
  ps.supplier_id,
  ps.id                                  AS statement_id,
  ps.statement_number,
  ps.period_start,
  ps.period_end,
  ps.status,
  ps.total_gross_ils,
  ps.total_platform_fee_ils,
  ps.total_payout_ils,
  ps.approved_at,
  ps.paid_at,
  ps.payment_reference,
  COALESCE(d.open_disputes, 0)           AS open_disputes
FROM public.payout_statements ps
LEFT JOIN (
  SELECT sd.statement_id, count(*) AS open_disputes
  FROM public.supplier_disputes sd
  WHERE sd.status IN ('open'::public.dispute_status, 'in_review'::public.dispute_status)
    AND sd.statement_id IS NOT NULL
  GROUP BY sd.statement_id
) d ON d.statement_id = ps.id
WHERE ps.deleted_at IS NULL;

COMMENT ON VIEW public.v_supplier_payouts IS
  'Supplier portal: own payout statements with open-dispute count. security_invoker; member RLS already excludes drafts. Open disputes block mark_payout_statement_paid (027).';

-- ---------------------------------------------------------------------------
-- 4. Admin BI views
-- ---------------------------------------------------------------------------

-- 4.1 Take-rate by platform_percent snapshot, monthly
CREATE OR REPLACE VIEW public.v_take_rate_monthly
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', (o.paid_at AT TIME ZONE 'Asia/Jerusalem'))::date AS month_il,
  oi.product_type,
  oi.platform_percent,
  count(DISTINCT o.id)                                                 AS orders,
  count(*)                                                             AS items,
  sum(oi.total_price_ils)                                              AS gmv_ils,
  sum(oi.charged_on_site_ils)                                          AS charged_on_site_ils,
  sum(oi.platform_fee_ils)                                             AS platform_revenue_ils,
  round(100.0 * sum(oi.platform_fee_ils)
    / NULLIF(sum(oi.total_price_ils), 0), 2)                           AS effective_take_rate_pct
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE o.paid_at IS NOT NULL
  AND o.deleted_at IS NULL
  AND oi.deleted_at IS NULL
GROUP BY 1, 2, 3;

COMMENT ON VIEW public.v_take_rate_monthly IS
  'Take-rate per (month, product_type, snapshotted platform_percent). effective_take_rate on coupons differs from platform_percent because GMV is face value while revenue is what was charged on site. Changing platform_percent today never moves past rows.';

-- 4.2 Coupon expiry liability report (one row per bucket)
--     Policy (docs/ARCHITECTURE-ANALYTICS-BI.md section 4.3): expired
--     unredeemed coupons are NOT auto-refunded; platform_paid_ils becomes
--     recognized breakage revenue at expiry. Goodwill wallet credits go
--     through support as manual_adjust and appear in wallet reporting.
CREATE OR REPLACE VIEW public.v_coupon_expiry_liability
WITH (security_invoker = true) AS
WITH open_codes AS (
  SELECT
    CASE
      WHEN cc.expires_at IS NULL                          THEN 'no_expiry'
      WHEN cc.expires_at <= now()                         THEN 'overdue_not_swept'
      WHEN cc.expires_at <= now() + interval '7 days'     THEN 'expiring_7d'
      WHEN cc.expires_at <= now() + interval '30 days'    THEN 'expiring_8_30d'
      WHEN cc.expires_at <= now() + interval '90 days'    THEN 'expiring_31_90d'
      ELSE 'expiring_90d_plus'
    END AS bucket,
    CASE
      WHEN cc.expires_at IS NULL                          THEN 1
      WHEN cc.expires_at <= now()                         THEN 0
      WHEN cc.expires_at <= now() + interval '7 days'     THEN 2
      WHEN cc.expires_at <= now() + interval '30 days'    THEN 3
      WHEN cc.expires_at <= now() + interval '90 days'    THEN 4
      ELSE 5
    END AS bucket_order,
    cc.platform_paid_ils,
    cc.collect_amount_ils,
    cc.face_value_ils
  FROM public.coupon_codes cc
  WHERE cc.status = 'issued'::public.coupon_status
    AND cc.deleted_at IS NULL
)
SELECT
  bucket,
  bucket_order,
  count(*)                              AS coupons,
  COALESCE(sum(platform_paid_ils), 0)   AS platform_paid_ils,
  COALESCE(sum(collect_amount_ils), 0)  AS collect_at_business_ils,
  COALESCE(sum(face_value_ils), 0)      AS face_value_ils
FROM open_codes
GROUP BY bucket, bucket_order
UNION ALL
SELECT
  'expired_unredeemed_12m', 6, count(*),
  COALESCE(sum(cc.platform_paid_ils), 0),
  COALESCE(sum(cc.collect_amount_ils), 0),
  COALESCE(sum(cc.face_value_ils), 0)
FROM public.coupon_codes cc
WHERE cc.status = 'expired'::public.coupon_status
  AND cc.deleted_at IS NULL
  AND cc.updated_at >= now() - interval '12 months'
UNION ALL
SELECT
  'refunded_12m', 7, count(*),
  COALESCE(sum(cc.platform_paid_ils), 0),
  COALESCE(sum(cc.collect_amount_ils), 0),
  COALESCE(sum(cc.face_value_ils), 0)
FROM public.coupon_codes cc
WHERE cc.status = 'refunded'::public.coupon_status
  AND cc.deleted_at IS NULL
  AND cc.updated_at >= now() - interval '12 months';

COMMENT ON VIEW public.v_coupon_expiry_liability IS
  'Owner exposure report: open coupons bucketed by time-to-expiry (money already in our account + cash businesses still expect), plus 12-month expired (breakage) and refunded context rows. overdue_not_swept > 0 means the expire_coupons() cron is behind.';

-- ---------------------------------------------------------------------------
-- 5. Materialized views (admin BI over full history; not exposed to browser
--    roles: no RLS on matviews, so SELECT is revoked and access goes through
--    the service client after requireAdminSession)
-- ---------------------------------------------------------------------------

-- 5.1 Cohort retention (first-paid-month cohorts x month offset)
DO $$
BEGIN
  IF to_regclass('public.mv_cohort_retention_monthly') IS NULL THEN
    CREATE MATERIALIZED VIEW public.mv_cohort_retention_monthly AS
    SELECT
      cohort_month,
      cohort_size,
      month_offset,
      active_buyers,
      round(100.0 * active_buyers / NULLIF(cohort_size, 0), 1) AS retention_pct,
      platform_revenue_ils,
      revenue_per_cohort_user_ils
    FROM public.v_cohort_ltv_monthly
    WITH DATA;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS mv_cohort_retention_monthly_pk
  ON public.mv_cohort_retention_monthly (cohort_month, month_offset);

REVOKE ALL ON public.mv_cohort_retention_monthly FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mv_cohort_retention_monthly TO service_role;

COMMENT ON MATERIALIZED VIEW public.mv_cohort_retention_monthly IS
  'Nightly snapshot of v_cohort_ltv_monthly + retention_pct. Read via service client after requireAdminSession only. Refreshed by fn_refresh_analytics_matviews (02:40 Israel).';

-- 5.2 Take-rate monthly snapshot
DO $$
BEGIN
  IF to_regclass('public.mv_take_rate_monthly') IS NULL THEN
    CREATE MATERIALIZED VIEW public.mv_take_rate_monthly AS
    SELECT * FROM public.v_take_rate_monthly
    WITH DATA;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS mv_take_rate_monthly_pk
  ON public.mv_take_rate_monthly (month_il, product_type, platform_percent);

REVOKE ALL ON public.mv_take_rate_monthly FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mv_take_rate_monthly TO service_role;

COMMENT ON MATERIALIZED VIEW public.mv_take_rate_monthly IS
  'Nightly snapshot of v_take_rate_monthly. Read via service client after requireAdminSession only. Refreshed by fn_refresh_analytics_matviews (02:40 Israel).';

-- 5.3 Refresh function (nightly 02:40 Israel via pg_cron, after the 02:10
--     analytics rollup; scheduling itself is done at apply time, not here).
--     Plain REFRESH on purpose: CONCURRENTLY cannot run inside a function's
--     transaction, and these matviews are tiny + read only by the admin
--     dashboard, so the brief exclusive lock at 02:40 is irrelevant. The
--     unique indexes above keep the CONCURRENTLY option open if this ever
--     moves to a direct pg_cron SQL command.
CREATE OR REPLACE FUNCTION public.fn_refresh_analytics_matviews()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'fn_refresh_analytics_matviews: admin or service role only';
  END IF;

  REFRESH MATERIALIZED VIEW public.mv_cohort_retention_monthly;
  REFRESH MATERIALIZED VIEW public.mv_take_rate_monthly;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_refresh_analytics_matviews() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_analytics_matviews() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. AI-agent integration surface
-- ---------------------------------------------------------------------------

-- 6.1 Grounded KPI snapshot for agents (service role only; agents never read
--     analytics_events raw). Single cheap call, all values from truth tables.
CREATE OR REPLACE FUNCTION public.fn_agent_kpi_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
BEGIN
  IF auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'fn_agent_kpi_snapshot: service role only';
  END IF;

  SELECT jsonb_build_object(
    'as_of', now(),
    'day_il', public.fn_il_date(now()),
    'paid_orders_today', (
      SELECT count(*) FROM public.orders o
      WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL
        AND public.fn_il_date(o.paid_at) = public.fn_il_date(now())),
    'platform_revenue_today_ils', (
      SELECT COALESCE(sum(oi.platform_fee_ils), 0)
      FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
        AND public.fn_il_date(o.paid_at) = public.fn_il_date(now())),
    'platform_revenue_7d_ils', (
      SELECT COALESCE(sum(oi.platform_fee_ils), 0)
      FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
        AND public.fn_il_date(o.paid_at) >= public.fn_il_date(now()) - 7),
    'coupons_outstanding', (
      SELECT count(*) FROM public.coupon_codes cc
      WHERE cc.status = 'issued'::public.coupon_status AND cc.deleted_at IS NULL),
    'coupons_outstanding_collect_ils', (
      SELECT COALESCE(sum(cc.collect_amount_ils), 0) FROM public.coupon_codes cc
      WHERE cc.status = 'issued'::public.coupon_status AND cc.deleted_at IS NULL),
    'redemption_rate_30d_pct', (
      SELECT round(100.0 * count(*) FILTER (WHERE cc.status = 'used'::public.coupon_status)
             / NULLIF(count(*), 0), 1)
      FROM public.coupon_codes cc
      WHERE cc.status IN ('used'::public.coupon_status, 'expired'::public.coupon_status)
        AND cc.updated_at >= now() - interval '30 days'),
    'wallet_liability_ils', (
      SELECT COALESCE(sum(wa.balance_ils), 0) FROM public.wallet_accounts wa
      WHERE wa.owner_type = 'user'),
    'active_money_alarms', (
      SELECT count(*) FROM public.v_money_alarms)
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_agent_kpi_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_agent_kpi_snapshot() TO service_role;

COMMENT ON FUNCTION public.fn_agent_kpi_snapshot() IS
  'Grounding surface for AI agents (028): compact business KPIs from truth tables in one call. Values are facts, never model memory. Extend here rather than giving agents broader table access.';

-- 6.2 Agent cost & outcome tracking (only if 028 is applied)
DO $do$
BEGIN
  IF to_regclass('public.agent_runs') IS NOT NULL THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW public.v_agent_costs_daily
      WITH (security_invoker = true) AS
      SELECT
        public.fn_il_date(ar.created_at)                                          AS day_il,
        ar.agent_key,
        count(*)                                                                  AS runs,
        count(*) FILTER (WHERE ar.status = 'succeeded'::public.agent_run_status)  AS succeeded,
        count(*) FILTER (WHERE ar.status = 'failed'::public.agent_run_status)     AS failed,
        count(*) FILTER (WHERE ar.status = 'escalated'::public.agent_run_status)  AS escalated,
        COALESCE(sum(ar.input_tokens), 0)                                         AS input_tokens,
        COALESCE(sum(ar.output_tokens), 0)                                        AS output_tokens,
        COALESCE(sum(ar.cache_read_tokens), 0)                                    AS cache_read_tokens,
        COALESCE(sum(ar.cost_usd), 0)                                             AS cost_usd,
        round(avg(ar.latency_ms))                                                 AS avg_latency_ms
      FROM public.agent_runs ar
      GROUP BY 1, 2
    $v$;
  END IF;
END $do$;

-- ===========================================================================
-- NOT in 035 (deliberately):
--   * application code: supplier portal screens, admin BI screens, agent tool
--     wiring for fn_agent_kpi_snapshot
--   * cron scheduling (pg_cron at apply time: nightly 02:40 Israel
--     fn_refresh_analytics_matviews, after 033's 02:10 rollup)
--   * new event-collection objects (033 owns ingest, partitions, rollup)
--   * wallet cashback expiry job (policy decided in the design doc section 8;
--     implementation belongs to the wallet/commerce domain)
--   * any change to 026-033; 034_vendors_unification.sql stays reserved
-- ===========================================================================
