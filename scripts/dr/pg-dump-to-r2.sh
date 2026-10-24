#!/usr/bin/env bash
# Daily PostgreSQL backup to Cloudflare R2
#
# Creates a pg_dump backup and uploads it to R2 with 30-day retention.
# Runs as GitHub Action or can be run manually.
#
# Usage:
#   SUPABASE_DB_URL=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... ./scripts/dr/pg-dump-to-r2.sh
#
# Environment variables:
#   SUPABASE_DB_URL         Direct postgres:// connection string
#   R2_ACCOUNT_ID           Cloudflare account ID
#   R2_ACCESS_KEY_ID        R2 API token access key ID
#   R2_SECRET_ACCESS_KEY    R2 API token secret key
#   R2_BUCKET               R2 bucket name (default: kenyonexpress-backups)
#   BACKUP_PREFIX           Path prefix in R2 bucket (default: postgres/)
#   AGE_RECIPIENT           Optional: age public key for encryption

set -euo pipefail

# Required environment variables
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY required}"

# Optional with defaults
R2_BUCKET="${R2_BUCKET:-kenyonexpress-backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-postgres/}"
KEEP_LOCAL="${KEEP_LOCAL:-0}"

# Generate timestamp and paths
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
DAY="$(date -u +%Y-%m-%d)"
BASE="kenyonexpress-${STAMP}"
WORK_DIR="${TMPDIR:-/tmp}/ke-backup-$$"
mkdir -p "${WORK_DIR}"
trap 'rm -rf "${WORK_DIR}"' EXIT

DUMP_PATH="${WORK_DIR}/${BASE}.dump"
SHA_PATH="${DUMP_PATH}.sha256"
UPLOAD_FILE="${DUMP_PATH}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting PostgreSQL backup..."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Target: s3://${R2_BUCKET}/${BACKUP_PREFIX}${DAY}/${BASE}.dump"

# Create pg_dump backup
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running pg_dump..."
pg_dump \
  --dbname="${SUPABASE_DB_URL}" \
  --format=custom \
  --no-owner \
  --no-acl \
  --verbose \
  --file="${DUMP_PATH}" 2>&1 | grep -v '^pg_dump: '

# Verify dump is not empty
if [[ ! -s "${DUMP_PATH}" ]]; then
  echo "[ERROR] Dump file is empty" >&2
  exit 1
fi

DUMP_SIZE=$(wc -c < "${DUMP_PATH}" | tr -d ' ')
if [[ "${DUMP_SIZE}" -lt 10000 ]]; then
  echo "[ERROR] Dump file is suspiciously small (${DUMP_SIZE} bytes)" >&2
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dump created: $(du -h "${DUMP_PATH}" | cut -f1)"

# Generate checksum
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Generating SHA-256 checksum..."
shasum -a 256 "${DUMP_PATH}" | tee "${SHA_PATH}"

# Optional: Encrypt with age
if [[ -n "${AGE_RECIPIENT:-}" ]]; then
  if ! command -v age >/dev/null; then
    echo "[WARNING] age not installed; skipping encryption" >&2
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Encrypting with age..."
    age -r "${AGE_RECIPIENT}" -o "${DUMP_PATH}.age" "${DUMP_PATH}"
    UPLOAD_FILE="${DUMP_PATH}.age"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Encrypted: $(du -h "${UPLOAD_FILE}" | cut -f1)"
  fi
fi

# Configure AWS CLI for R2
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="auto"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Upload to R2
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Uploading to R2..."
aws s3 cp "${UPLOAD_FILE}" \
  "s3://${R2_BUCKET}/${BACKUP_PREFIX}${DAY}/$(basename "${UPLOAD_FILE}")" \
  --endpoint-url "${R2_ENDPOINT}" \
  --only-show-errors

# Upload checksum
aws s3 cp "${SHA_PATH}" \
  "s3://${R2_BUCKET}/${BACKUP_PREFIX}${DAY}/$(basename "${SHA_PATH}")" \
  --endpoint-url "${R2_ENDPOINT}" \
  --only-show-errors

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Upload complete"

# List recent backups
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Recent backups:"
aws s3 ls "s3://${R2_BUCKET}/${BACKUP_PREFIX}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --recursive | tail -10

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete"
