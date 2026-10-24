#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Get token
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
export SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)

# List of migrations to apply (excluding 000_infrastructure which was not in original 26)
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
SKIPPED=0

for migration in "${migrations[@]}"; do
  echo "========================================"
  echo "Applying: $migration"
  echo "========================================"

  if timeout 60 node scripts/apply-migration-mcp.mjs "$migration" 2>&1; then
    ((APPLIED++)) || true
    echo "✓ $migration applied"
  else
    exit_code=$?
    if [[ $exit_code -eq 124 ]]; then
      echo "✗ $migration TIMEOUT"
      ((FAILED++)) || true
    else
      echo "✗ $migration FAILED (exit $exit_code)"
      ((FAILED++)) || true
    fi
  fi
  echo ""
done

echo "========================================"
echo "Summary:"
echo "  Applied: $APPLIED"
echo "  Failed:  $FAILED"
echo "  Skipped: $SKIPPED"
echo "  Total:   ${#migrations[@]}"
echo "========================================"

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
