#!/bin/bash
#
# Daily backup script for KenyonExpress
# Creates tar.gz backup with .git history, excludes build artifacts
# Rotates to keep 3 most recent backups
#
# Cron usage:
#   04 54 * * * /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh
#   14 54 * * * /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh
#
# This creates backups at:
#   - 04:54 UTC+7 (early morning)
#   - 14:54 UTC+7 (mid-afternoon)

set -e

BACKUP_DIR="$HOME/Desktop"
REPO_PATH="/Users/ofir/kenyonexpress-web/kenyonexpress"
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
BACKUP_FILE="$BACKUP_DIR/kenyonexpress-backup-$TIMESTAMP.tar.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup..."

# Navigate to repo directory
cd "$REPO_PATH" || exit 1

# Create backup with exclusions
tar czf "$BACKUP_FILE" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=playwright-report \
  --exclude=test-results \
  --exclude=coverage \
  --exclude='*.tar.gz' \
  -C /Users/ofir/kenyonexpress-web kenyonexpress

# Verify backup integrity
if ! tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
  echo "[ERROR] Backup integrity check failed: $BACKUP_FILE"
  rm -f "$BACKUP_FILE"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Cleanup old backups (keep 3 most recent)
cd "$BACKUP_DIR" || exit 1
BACKUP_COUNT=$(ls -1 kenyonexpress-backup-*.tar.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt 3 ]; then
  # Remove oldest backup
  OLDEST=$(ls -1t kenyonexpress-backup-*.tar.gz | tail -1)
  rm -f "$OLDEST"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Removed old backup: $OLDEST"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete. Total backups: $(ls -1 kenyonexpress-backup-*.tar.gz 2>/dev/null | wc -l)"
