#!/usr/bin/env bash
# Schema-only backup of the hosted Supabase project.
#
# WHAT THIS IS FOR. supabase/migrations/ does NOT describe production. The
# hosted project is a different lineage: it is pre-059 and still carries
# `payments.amount_ils` where the migration chain says `amount_agorot`. Replaying
# the chain into an empty database gives you a schema this application does not
# run against. The only trustworthy description of production is one taken FROM
# production, which is this.
#
# WHAT IT DELIBERATELY WILL NOT DO. It will not write a file it could not verify.
# The classic disaster-recovery failure is not a missing backup, it is a present
# one that turns out to be empty, truncated, or an error page saved with a .sql
# extension. Nobody looks until the day it matters. So: dump to a temp file,
# check it, and only then move it into place. On any doubt, exit non-zero and
# leave the previous good dump untouched.
#
#   ./scripts/backup-schema.sh                 # -> backups/schema-<date>.sql
#   OUT_DIR=/tmp ./scripts/backup-schema.sh
#
# Needs ONE of:
#   SUPABASE_DB_URL   a direct postgres:// connection string, plus pg_dump
#   a linked project  (supabase link --project-ref <ref>), plus the supabase CLI
#
# Read-only against the database. It never writes to Postgres.

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-ixvwfbuvfxxsjiywhbbb}"
OUT_DIR="${OUT_DIR:-backups}"
KEEP="${KEEP:-7}"
STAMP="$(date +%Y-%m-%d-%H%M)"
FINAL="${OUT_DIR}/schema-${STAMP}.sql"
TMP="$(mktemp -t ke-schema-XXXXXX.sql)"
trap 'rm -f "${TMP}"' EXIT

# Objects we know exist in production. If a dump is missing any of them it is
# not a dump of THIS database, whatever its size. `vouchers` and `payments` are
# the money path; `settlement_status` is the enum the order state machine reads.
REQUIRED=(
  "CREATE TABLE"
  "vouchers"
  "payments"
  "order_items"
  "settlement_status"
)
MIN_BYTES=20000

fail() { printf '\033[31merror\033[0m  %s\n' "$1" >&2; exit 1; }

# One message for both "we cannot reach it" paths, so the never-linked case and
# the link-went-stale case give the same instructions instead of one of them
# giving a raw CLI error.
UNREACHABLE="cannot reach the database. Nothing was written; any previous dump in ${OUT_DIR:-backups} is untouched.
  Provide ONE of:
    1. SUPABASE_DB_URL + pg_dump        pg_dump missing? \`brew install libpq\`
    2. a linked project + supabase CLI  \`supabase link --project-ref \${PROJECT_REF}\`"

note() { printf '\033[36m..\033[0m     %s\n' "$1"; }
ok()   { printf '\033[32mok\033[0m     %s\n' "$1"; }

mkdir -p "${OUT_DIR}"

if [[ -n "${SUPABASE_DB_URL:-}" ]] && command -v pg_dump >/dev/null 2>&1; then
  note "pg_dump against SUPABASE_DB_URL"
  pg_dump --schema-only --no-owner --no-privileges \
          --schema=public --schema=auth --schema=storage \
          "${SUPABASE_DB_URL}" > "${TMP}"
elif command -v supabase >/dev/null 2>&1 && [[ -f supabase/.temp/project-ref ]]; then
  # project-ref, NOT the .temp directory. The CLI creates .temp on ANY
  # invocation (`supabase --version` is enough) to cache its version check, so
  # testing the directory reports every machine with the CLI installed as
  # linked. This script did exactly that on its first run and took a branch it
  # could not complete. `project-ref` is written by `supabase link` alone.
  note "supabase db dump (linked project ${PROJECT_REF})"
  supabase db dump --schema public --file "${TMP}" || fail "${UNREACHABLE}"
else
  # Saying exactly what is missing, because "backup failed" sends somebody
  # hunting through this file at the worst possible moment.
  fail "${UNREACHABLE}"
fi

# --- verification, before anything is moved into place -----------------------

[[ -s "${TMP}" ]] || fail "the dump is empty. Nothing was written."

bytes=$(wc -c < "${TMP}" | tr -d ' ')
if [[ "${bytes}" -lt "${MIN_BYTES}" ]]; then
  fail "the dump is ${bytes} bytes, under the ${MIN_BYTES} floor.
  A schema this small is a truncated transfer or an error page, not 53 tables."
fi

for needle in "${REQUIRED[@]}"; do
  grep -q -- "${needle}" "${TMP}" \
    || fail "the dump has no '${needle}'. This is not a dump of ${PROJECT_REF}. Nothing was written."
done

tables=$(grep -c '^CREATE TABLE' "${TMP}" || true)
if [[ "${tables}" -lt 40 ]]; then
  fail "the dump declares ${tables} tables; production has 53. Refusing a partial dump."
fi

mv "${TMP}" "${FINAL}"
trap - EXIT
ok "${FINAL}  (${bytes} bytes, ${tables} tables)"

# --- rotation ----------------------------------------------------------------
# Deleting only files this script itself created, matched by its own name
# pattern, in the directory it was told to use.
# `mapfile` is bash 4; macOS ships bash 3.2, and this script must run on the
# machine it is meant to protect.
ls -1t "${OUT_DIR}"/schema-*.sql 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r stale; do
  [[ -n "${stale}" ]] || continue
  rm -f "${stale}"
  note "pruned ${stale}"
done
