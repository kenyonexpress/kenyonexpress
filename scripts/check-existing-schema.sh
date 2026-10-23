#!/usr/bin/env bash
# Check existing schema of C16 tables in production

set -euo pipefail

TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
DEC=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)

SQL="
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('payment_events', 'refunds', 'search_index_outbox')
ORDER BY table_name, ordinal_position;
"

echo "📋 Existing schema in production:"
echo ""

curl -s -H "Authorization: Bearer $DEC" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -n --arg q "$SQL" '{query:$q}')" \
  https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/database/query | \
  jq -r '.[] | "\(.table_name).\(.column_name): \(.data_type) \(if .is_nullable == "YES" then "NULL" else "NOT NULL" end)"'
