# C125 — Money invariants (audit, 2026-11-01)

## Gate 1: grep outside src/lib/money.ts (non-test)
$ grep -rnE "parseFloat|toFixed|Number\(" src/ | grep -v "^src/lib/money.ts" | grep -v "\.test\." | wc -l
     346

## Gate 2: numeric money columns still in migrations
$ grep -rniE "^\s*(kenyon_price|full_price|[a-z_]*_ils|[a-z_]*percent[a-z_]*)\s+(numeric|decimal)" migrations
migrations/applied/152_payout_machinery.sql:81:  total_gross_ils        numeric(12,2) NOT NULL DEFAULT 0,
migrations/applied/152_payout_machinery.sql:82:  total_platform_fee_ils numeric(12,2) NOT NULL DEFAULT 0,
migrations/applied/152_payout_machinery.sql:83:  total_payout_ils       numeric(12,2) NOT NULL DEFAULT 0,
migrations/applied/152_payout_machinery.sql:119:  gross_ils        numeric(12,2) NOT NULL DEFAULT 0,
migrations/applied/152_payout_machinery.sql:120:  platform_percent numeric(5,2),
migrations/applied/152_payout_machinery.sql:121:  platform_fee_ils numeric(12,2) NOT NULL DEFAULT 0,
migrations/applied/152_payout_machinery.sql:122:  payout_ils       numeric(12,2) NOT NULL DEFAULT 0,
migrations/applied/163_orders_indexes.sql:66:  platform_percent numeric(5, 2) not null,
migrations/applied/163_orders_indexes.sql:69:  cashback_percent numeric(5, 2) not null,
migrations/applied/135b_recurring_subscriptions.sql:154:  platform_percent       numeric(5,2) NOT NULL CHECK (platform_percent >= 0 AND platform_percent <= 100),
migrations/applied/193_observability_endpoint_metrics.sql:17:  error_rate_percent numeric(5, 2) NOT NULL DEFAULT 0,
migrations/applied/193_observability_endpoint_metrics.sql:20:  sla_target_percent numeric(5, 2) NOT NULL DEFAULT 99.9,
migrations/applied/171_search_fts.sql:150:  kenyon_price numeric,
migrations/applied/171_search_fts.sql:151:  full_price numeric,
migrations/applied/288_customer_rfm_segmentation.sql:47:  monetary_total_ils   numeric(12,2)  NOT NULL DEFAULT 0.00,
migrations/applied/288_customer_rfm_segmentation.sql:50:  avg_order_value_ils  numeric(12,2)  NOT NULL DEFAULT 0.00,
migrations/applied/288_customer_rfm_segmentation.sql:84:  min_monetary_total_ils    numeric(12,2)  NOT NULL DEFAULT 0.00,
migrations/applied/288_customer_rfm_segmentation.sql:200:  monetary_total_ils numeric
migrations/applied/288_customer_rfm_segmentation.sql:348:  monetary_total_ils numeric,
migrations/applied/192_observability_schema.sql:15:  error_rate_percent numeric(5, 2) NOT NULL DEFAULT 0,
migrations/applied/192_observability_schema.sql:16:  sla_target_percent numeric(5, 2) NOT NULL DEFAULT 99.9,

## Gate 3: platform_percent snapshot test
$ npx vitest run src/server/payments/platform-percent-immutability.test.ts
 Test Files  1 skipped (1) / Tests  2 skipped (2)  (test exists, skipped: needs DB)

RESULT: BLOCKED gates fail: grep=346 hits, numeric money columns remain, snapshot test skipped not passing
