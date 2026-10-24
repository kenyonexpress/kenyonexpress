#!/usr/bin/env bash
# Apply migration 297: Supplier verification status
# Run this when Supabase access is available (MCP OAuth or CLI auth)

set -euo pipefail

MIGRATION_FILE="supabase/migrations/297_supplier_verification_status.sql"
MIGRATION_NUMBER="297"

echo "🔍 Checking if migration ${MIGRATION_NUMBER} is already applied..."

# Check via Supabase CLI (requires: supabase link)
if command -v supabase &> /dev/null; then
  echo "📋 Checking migration status..."
  supabase migration list --linked | grep -q "297_" && {
    echo "✅ Migration 297 already applied"
    exit 0
  }
fi

echo "📝 Applying migration ${MIGRATION_NUMBER}..."
cat "${MIGRATION_FILE}"

# Apply via CLI
if command -v supabase &> /dev/null; then
  supabase db push
  echo "✅ Migration pushed to database"
else
  echo "❌ Supabase CLI not available. Apply manually via dashboard:"
  echo "   1. Go to https://supabase.com/dashboard"
  echo "   2. Navigate to SQL Editor"
  echo "   3. Paste and run contents of: ${MIGRATION_FILE}"
fi

# Verify columns exist
echo "🔍 Verifying migration application..."
psql "${SUPABASE_DB_URL:-}" -c "
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'suppliers'
    AND column_name IN ('verification_status', 'verified_at', 'verified_by')
  ORDER BY column_name;
" 2>/dev/null || echo "⚠️  Cannot verify - no database connection"

echo "✅ Migration script complete"
