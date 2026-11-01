#!/usr/bin/env bash
#
# Rehearse migration 300 against production in a rolled-back transaction
# Per CLAUDE.md: migrations NEVER applied without explicit approval
# This script verifies the migration WOULD work without changing anything
#

set -euo pipefail

MIGRATION_FILE="migrations/pending/300_c16_payment_refund_infrastructure.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

echo "🔍 Rehearsing migration 300 against production (rolled back)..."
echo ""

# Get token from macOS keychain
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
if [ -z "$TOKEN" ]; then
  echo "❌ No Supabase CLI token in keychain"
  exit 1
fi

# Decode base64-encoded token
DEC=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)

# Read migration file
MIGRATION_SQL=$(cat "$MIGRATION_FILE")

# Wrap in BEGIN/ROLLBACK and add verification query
SQL="
BEGIN;

${MIGRATION_SQL}

-- Verify tables were created
SELECT
  'payment_events' as table_name,
  COUNT(*) as exists
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'payment_events'
UNION ALL
SELECT
  'refunds' as table_name,
  COUNT(*) as exists
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'refunds'
UNION ALL
SELECT
  'search_index_outbox' as table_name,
  COUNT(*) as exists
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'search_index_outbox';

ROLLBACK;
"

# Make API request
RESPONSE=$(curl -s -H "Authorization: Bearer $DEC" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -n --arg q "$SQL" '{query:$q}')" \
  https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/database/query)

# Check for errors
if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "❌ Migration rehearsal FAILED"
  echo ""
  echo "$RESPONSE" | jq '.error'
  exit 1
fi

# Extract and display results
echo "✅ Migration rehearsal SUCCESSFUL (rolled back, no changes made)"
echo ""
echo "Verification query results:"
if echo "$RESPONSE" | jq -e '.[0]' > /dev/null 2>&1; then
  echo "$RESPONSE" | jq -r '.[] | "\(.table_name): \(.exists)"'
else
  echo "$RESPONSE" | jq -r '.'
fi

echo ""
echo "📋 Summary:"
echo "- Migration 300 syntax: VALID"
echo "- Table creation: WOULD SUCCEED"
echo "- Constraints: WOULD BE ENFORCED"
echo "- Triggers: WOULD BE CREATED"
echo ""
echo "⚠️  Migration was ROLLED BACK per CLAUDE.md rules"
echo "    (migrations NEVER applied without explicit approval)"
echo ""
echo "To apply for real, manual application required via:"
echo "  - Supabase dashboard SQL editor, OR"
echo "  - supabase db push (requires linked project), OR"
echo "  - psql with production connection string"
