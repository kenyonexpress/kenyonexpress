#!/usr/bin/env bash
# Restore a kenyonexpress dump into a SCRATCH database.
# docs/DB-RESTORE-RUNBOOK.md walks through when and how; the quarterly drill
# (.github/workflows/db-restore-drill.yml) runs this against a throwaway
# Postgres 17 container.
#
#   TARGET_DATABASE_URL=postgres://... DUMP_FILE=path/to/x.dump \
#     [PREPARE_SCRATCH=1] ./scripts/dr/pg-restore.sh
#
# PREPARE_SCRATCH=1 first creates the Supabase-managed roles and extensions a
# vanilla Postgres lacks. The dump is taken with --schema filters, and pg_dump
# then deliberately omits CREATE EXTENSION for anything outside those schemas,
# so column defaults like extensions.gen_random_uuid() would otherwise fail.
#
# pg_restore's exit code is NOT the gate here. Restoring a Supabase dump into
# vanilla Postgres always produces some errors (event triggers, publications,
# grants to absent roles) that say nothing about the data. The gate is
# scripts/dr/verify-restore.sql, run afterwards, which fails hard on anything
# that matters. This script's own hard failures are the ones with no recovery:
# unreachable target, unreadable dump, and a production target.

set -euo pipefail

: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL required (a scratch database, never production)}"
: "${DUMP_FILE:?DUMP_FILE required (from scripts/dr/restore-latest.mjs)}"

# The one non-negotiable guard. A restore with --clean pointed at production is
# the disaster this pipeline exists to recover from, not one it may cause.
# Real-incident restores go to a NEW project, which has a different ref.
PROD_REF="ixvwfbuvfxxsjiywhbbb"
if [[ "${TARGET_DATABASE_URL}" == *"${PROD_REF}"* ]]; then
  echo "error TARGET_DATABASE_URL points at the production project (${PROD_REF}). Refusing." >&2
  exit 1
fi

[[ -s "${DUMP_FILE}" ]] || { echo "error ${DUMP_FILE} is missing or empty" >&2; exit 1; }
pg_restore --list "${DUMP_FILE}" > /dev/null || { echo "error pg_restore cannot read ${DUMP_FILE}" >&2; exit 1; }

if [[ "${PREPARE_SCRATCH:-0}" == "1" ]]; then
  echo ".. preparing scratch: supabase roles + extensions"
  psql "${TARGET_DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'anon', 'authenticated', 'service_role', 'authenticator',
    'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin',
    'supabase_realtime_admin', 'dashboard_user', 'pgbouncer'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS citext;
SQL
fi

echo ".. pg_restore ${DUMP_FILE}"
set +e
pg_restore \
  --dbname="${TARGET_DATABASE_URL}" \
  --clean --if-exists \
  --no-owner --no-acl \
  --jobs="${RESTORE_JOBS:-4}" \
  "${DUMP_FILE}" 2> /tmp/ke-restore-errors.log
STATUS=$?
set -e

ERRORS=$(grep -c '^pg_restore: error:' /tmp/ke-restore-errors.log || true)
echo ".. pg_restore exit ${STATUS}, ${ERRORS} errors (expected nonzero on vanilla Postgres; verify-restore.sql is the gate)"
if [[ "${ERRORS}" -gt 0 ]]; then
  echo ".. last errors:"
  grep '^pg_restore: error:' /tmp/ke-restore-errors.log | tail -20
fi

echo "ok restore finished; now run:"
echo "   psql \"\${TARGET_DATABASE_URL}\" -v ON_ERROR_STOP=1 -f scripts/dr/verify-restore.sql"
