#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
export SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)

# All 27 migrations in pending/ (excluding 000 and preflight)
migrations=(
  "162_cron_schedule.sql"
  "169_analytics_server_event_names.sql"
  "170_composite_indexes_top_queries.sql"
  "171_category_name_shekel_order.sql"
  "172_hide_master_product_test_row.sql"
  "173_products_retired_commission_percent.sql"
  "174_wallet_topups.sql"
  "175_referral_program_settings.sql"
  "176_supplier_pin_rate_limit_per_staff.sql"
  "177_set_updated_at_search_path.sql"
  "184_carts_one_row_per_owner.sql"
  "188_search_analytics.sql"
  "189_affiliate_program.sql"
  "190_partner_api_infrastructure.sql"
  "191_saved_payment_method.sql"
  "192_notification_history.sql"
  "192_observability_schema.sql"
  "193_observability_endpoint_metrics.sql"
  "194_p95_latency_samples.sql"
  "195_perf_tickets.sql"
  "196_p95_statistics_function.sql"
  "200_deal_seeding_infrastructure.sql"
  "276_stock_notifications.sql"
  "277_fraud_monitoring.sql"
  "287_sms_marketing.sql"
  "288_customer_rfm_segmentation.sql"
  "289_cron_revenue_daily.sql"
)

APPLIED=0
FAILED=0
FAILED_LIST=()

for migration in "${migrations[@]}"; do
  echo "=== $migration ==="
  if timeout 60 node scripts/apply-migration-mcp.mjs "$migration" 2>&1 | tee /tmp/migration-output.txt | grep -q "✓ Verified"; then
    ((APPLIED++)) || true
    echo "✓ APPLIED"
  else
    ((FAILED++)) || true
    FAILED_LIST+=("$migration")
    error=$(grep -o "ERROR:.*" /tmp/migration-output.txt | head -1 || echo "unknown error")
    echo "✗ FAILED: $error"
  fi
  echo ""
done

echo "========================================"
echo "FINAL SUMMARY:"
echo "  Applied and verified: $APPLIED"
echo "  Failed: $FAILED"
if [[ $FAILED -gt 0 ]]; then
  echo "  Failed migrations:"
  for name in "${FAILED_LIST[@]}"; do
    echo "    - $name"
  done
fi
echo "========================================"
