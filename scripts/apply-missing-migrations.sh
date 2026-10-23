#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Get token
TOKEN=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
export SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)

# Migrations not found in schema_migrations (need to be applied)
migrations=(
  "162_cron_schedule.sql"
  "174_wallet_topups.sql"
  "175_referral_program_settings.sql"
  "176_supplier_pin_rate_limit_per_staff.sql"
  "184_carts_one_row_per_owner.sql"
  "189_affiliate_program.sql"
  "190_partner_api_infrastructure.sql"
  "191_saved_payment_method.sql"
  "276_stock_notifications.sql"
  "277_fraud_monitoring.sql"
  "287_sms_marketing.sql"
  "288_customer_rfm_segmentation.sql"
)

APPLIED=0
FAILED=0
FAILED_NAMES=()

for migration in "${migrations[@]}"; do
  echo "========================================"
  echo "Applying: $migration"
  echo "========================================"

  if timeout 60 node scripts/apply-migration-mcp.mjs "$migration" 2>&1; then
    ((APPLIED++)) || true
    echo "✓ $migration applied and verified"
  else
    exit_code=$?
    echo "✗ $migration FAILED (exit $exit_code)"
    ((FAILED++)) || true
    FAILED_NAMES+=("$migration")
  fi
  echo ""
done

echo "========================================"
echo "Summary:"
echo "  Applied: $APPLIED"
echo "  Failed:  $FAILED"
if [[ $FAILED -gt 0 ]]; then
  echo "  Failed migrations:"
  for name in "${FAILED_NAMES[@]}"; do
    echo "    - $name"
  done
fi
echo "========================================"

exit $FAILED
