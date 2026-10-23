#!/usr/bin/env bash
# C02: Apply all pending migrations via Supabase MCP in filename order

set -euo pipefail

cd "$(dirname "$0")/.."

# Get Supabase token
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || echo "")
if [ -z "$TOKEN" ]; then
  echo "ERROR: No Supabase CLI token found in keychain"
  exit 1
fi

export SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)

# List of migrations in order
MIGRATIONS=(
  162_cron_schedule.sql
  169_analytics_server_event_names.sql
  170_composite_indexes_top_queries.sql
  171_category_name_shekel_order.sql
  172_hide_master_product_test_row.sql
  173_products_retired_commission_percent.sql
  174_wallet_topups.sql
  175_referral_program_settings.sql
  176_supplier_pin_rate_limit_per_staff.sql
  177_set_updated_at_search_path.sql
  184_carts_one_row_per_owner.sql
  188_search_analytics.sql
  189_affiliate_program.sql
  190_partner_api_infrastructure.sql
  191_saved_payment_method.sql
  192_notification_history.sql
  192_observability_schema.sql
  193_observability_endpoint_metrics.sql
  194_p95_latency_samples.sql
  195_perf_tickets.sql
  196_p95_statistics_function.sql
  200_deal_seeding_infrastructure.sql
  276_stock_notifications.sql
  277_fraud_monitoring.sql
  287_sms_marketing.sql
  288_customer_rfm_segmentation.sql
)

LOG_DIR="logs/c02-migrations"
mkdir -p "$LOG_DIR"

RESULTS_FILE="$LOG_DIR/results-$(date +%Y%m%d-%H%M%S).jsonl"
SUMMARY_FILE="$LOG_DIR/summary-$(date +%Y%m%d-%H%M%S).txt"

echo "Applying ${#MIGRATIONS[@]} migrations..."
echo "Results: $RESULTS_FILE"
echo "Summary: $SUMMARY_FILE"
echo ""

APPLIED=0
FAILED=0
SKIPPED=0

for migration in "${MIGRATIONS[@]}"; do
  echo "[$((APPLIED + SKIPPED + FAILED + 1))/${#MIGRATIONS[@]}] Applying $migration..."

  if node scripts/apply-migration-mcp.mjs "$migration" > "$LOG_DIR/${migration%.sql}.json" 2>&1; then
    echo "  ✓ Success"
    cat "$LOG_DIR/${migration%.sql}.json" >> "$RESULTS_FILE"
    echo "" >> "$RESULTS_FILE"
    ((APPLIED++)) || true
  else
    # Check if it's an "already exists" error
    if grep -q "already exists\|duplicate key" "$LOG_DIR/${migration%.sql}.json"; then
      echo "  ⊘ Skipped (already applied)"
      echo "{\"file\":\"$migration\",\"status\":\"skipped\",\"reason\":\"already_exists\"}" >> "$RESULTS_FILE"
      echo "" >> "$RESULTS_FILE"
      ((SKIPPED++)) || true
    else
      echo "  ✗ FAILED"
      echo "{\"file\":\"$migration\",\"error\":\"See log\"}" >> "$RESULTS_FILE"
      echo "" >> "$RESULTS_FILE"
      ((FAILED++)) || true

      # Log failure but continue (goal is to apply as many as possible)
      echo "  Note: Continuing with remaining migrations..."
    fi
  fi

  echo ""
done

# Write summary
{
  echo "C02 Migration Application Summary"
  echo "================================="
  echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Total migrations: ${#MIGRATIONS[@]}"
  echo "Applied successfully: $APPLIED"
  echo "Skipped (already exists): $SKIPPED"
  echo "Failed: $FAILED"
  echo ""
  echo "See $RESULTS_FILE for detailed results"
} > "$SUMMARY_FILE"

cat "$SUMMARY_FILE"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "⚠️  Some migrations failed. Check logs in $LOG_DIR"
  exit 1
else
  echo ""
  echo "✓ All migrations processed successfully ($APPLIED applied, $SKIPPED skipped)"
  exit 0
fi
