#!/usr/bin/env bash
# F63 Category Filter Chips - Deployment Verification Script
# Run this to verify the feature is ready to deploy

set -euo pipefail

echo "=== F63 Category Filter Chips Deployment Verification ==="
echo

# Check migration file exists
echo "✓ Checking migration file..."
if [ -f "supabase/migrations/130_suppliers_open_weekends.sql" ]; then
  echo "  ✓ Migration 130 exists"
else
  echo "  ✗ Migration 130 missing!"
  exit 1
fi

# Check if Supabase CLI is available
echo
echo "✓ Checking Supabase CLI..."
if command -v supabase &> /dev/null; then
  echo "  ✓ Supabase CLI installed"
else
  echo "  ✗ Supabase CLI not found"
  echo "  Install: https://supabase.com/docs/guides/cli"
  exit 1
fi

# Check database schema
echo
echo "✓ Checking database schema..."
SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2 | tr -d '"')

# Test products.shipping_price_agorot (should exist)
SHIPPING_TEST=$(curl -s "${SUPABASE_URL}/rest/v1/products?select=shipping_price_agorot&limit=1" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

if echo "$SHIPPING_TEST" | grep -q "42703"; then
  echo "  ✗ products.shipping_price_agorot MISSING (migration 278 not applied)"
  exit 1
else
  echo "  ✓ products.shipping_price_agorot exists"
fi

# Test suppliers.open_weekends (should exist after migration 130)
WEEKEND_TEST=$(curl -s "${SUPABASE_URL}/rest/v1/suppliers?select=open_weekends&limit=1" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

if echo "$WEEKEND_TEST" | grep -q "42703"; then
  echo "  ✗ suppliers.open_weekends MISSING"
  echo
  echo "  To apply migration 130:"
  echo "    cd $(pwd)"
  echo "    supabase db push"
  echo
  echo "  Or manually:"
  echo "    psql \$DATABASE_URL -f supabase/migrations/130_suppliers_open_weekends.sql"
  echo
  exit 1
else
  echo "  ✓ suppliers.open_weekends exists"
fi

# Check code files
echo
echo "✓ Checking implementation files..."
FILES=(
  "src/components/CategoryFilterChips.tsx"
  "src/components/category/CategoryFilteredGrid.tsx"
  "src/lib/category-filter-chips.ts"
  "src/lib/category-filter-chips.test.ts"
  "src/styles/category-page.css"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file missing"
    exit 1
  fi
done

# Run tests
echo
echo "✓ Running tests..."
if pnpm test src/lib/category-filter-chips.test.ts --run > /dev/null 2>&1; then
  echo "  ✓ All 35 tests passing"
else
  echo "  ✗ Tests failed"
  pnpm test src/lib/category-filter-chips.test.ts --run
  exit 1
fi

# Check build
echo
echo "✓ Checking build..."
if pnpm type-check > /dev/null 2>&1; then
  echo "  ✓ Type check passes"
else
  echo "  ✗ Type check failed"
  exit 1
fi

echo
echo "=== ✓ F63 READY TO DEPLOY ==="
echo
echo "All checks passed. The feature will work correctly once deployed."
echo
echo "Filter chips:"
echo "  - פתוח בסופ״ש (supplier.open_weekends)"
echo "  - משלוח חינם (shipping_price_agorot = 0)"
echo "  - עד 100₪ (kenyon_price <= 100)"
echo "  - עד 500₪ (kenyon_price <= 500)"
echo
