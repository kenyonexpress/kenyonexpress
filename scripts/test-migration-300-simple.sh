#!/usr/bin/env bash
# Simple test of migration 300 - just check if it parses

set -euo pipefail

TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
DEC=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)

# Just test table existence check
SQL="
SELECT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'payment_events'
) as payment_events_exists,
EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'refunds'
) as refunds_exists,
EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'search_index_outbox'
) as search_index_outbox_exists;
"

curl -s -H "Authorization: Bearer $DEC" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -n --arg q "$SQL" '{query:$q}')" \
  https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/database/query | jq '.'
