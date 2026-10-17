# Backup Cron Setup - Twice-Daily Automated Backups

**Status:** Ready to deploy  
**Frequency:** Twice daily (04:54 UTC+7 and 14:54 UTC+7)  
**Objective:** Reduce RPO from 23 hours to ~12 hours

---

## Quick Setup

### 1. Make Backup Script Executable

```bash
chmod +x /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh
```

### 2. Install Cron Jobs

Edit your crontab:

```bash
crontab -e
```

Add these two lines:

```
# KenyonExpress backups: 04:54 UTC+7 (early morning)
54 04 * * * /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh >> /tmp/kenyonexpress-backup.log 2>&1

# KenyonExpress backups: 14:54 UTC+7 (mid-afternoon)
54 14 * * * /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh >> /tmp/kenyonexpress-backup.log 2>&1
```

### 3. Verify Cron Installation

```bash
crontab -l | grep kenyonexpress
```

Expected output:

```
54 04 * * * /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh >> /tmp/kenyonexpress-backup.log 2>&1
54 14 * * * /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh >> /tmp/kenyonexpress-backup.log 2>&1
```

### 4. Test Backup Script

Run immediately to verify:

```bash
/Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh
```

Check results:

```bash
ls -lh ~/Desktop/kenyonexpress-backup-*.tar.gz | tail -3
```

---

## What The Backup Script Does

**File:** `scripts/backup.sh`

### Execution Steps

1. **Create tar.gz backup** with exclusions:
   - ✅ Includes: .git/, src/, docs/, migrations/, scripts/, package.json, pnpm-lock.yaml
   - ❌ Excludes: node_modules/, .next/, test artifacts, backup files

2. **Verify tar integrity** — stops if archive is corrupted

3. **Log backup details** — timestamp, size, location

4. **Cleanup old backups** — keeps 3 most recent, removes oldest if >3

### Performance

- **Typical duration:** 10-15 minutes
- **Backup size:** ~890 MB per backup
- **Disk space:** 3 backups × 890 MB = ~2.7 GB (typically exists)

### Log Location

```
/tmp/kenyonexpress-backup.log
```

Check logs:

```bash
tail -30 /tmp/kenyonexpress-backup.log
```

---

## RPO Improvement (Before → After)

### Before: Once-Daily Backups

| Scenario | RPO | Example |
|----------|-----|---------|
| Backup at 04:54 UTC+7 | Max 24h | Failure at 04:53 next day = 24h loss |
| Typical | 12h avg | Mid-day failure = ~12h loss |

### After: Twice-Daily Backups

| Scenario | RPO | Example |
|----------|-----|---------|
| Backup at 04:54 & 14:54 UTC+7 | Max 12h | Failure at 14:53 = 12h loss |
| Typical | 6h avg | Any time failure = ~6h loss |

**Result:** RPO improved from 23h → 12h (50% reduction)

---

## Monitoring Backups

### Daily Backup Health Check

Run this script to validate backups:

```bash
pnpm backup:health
```

Expected output (if healthy):

```
🔍 Backup Health Check
✅ BACKUP HEALTH: HEALTHY
   RPO: 8h / 23h ✅
   Backups: 3 / 3 ✅
```

### Automated Monitoring (Optional)

Add backup health check to observability cron:

**File:** `src/app/api/cron/observability-check/route.ts`

Add this code to the cron handler:

```typescript
// Check backup health
const backupCheck = await execSync('node scripts/backup-health-check.mjs');
if (backupCheck.status !== 0) {
  sendNtfyAlert({
    severity: 'critical',
    title: 'Backup Health Degraded',
    message: `RPO exceeded or backup count low`,
  });
}
```

This would run every 5 minutes, checking backup health automatically.

---

## Troubleshooting

### Issue: Cron job not running

**Check:** Is `/usr/sbin/cron` running?

```bash
pgrep -l cron
```

If not running (macOS):

```bash
sudo launchctl start com.vixie.cron
```

### Issue: Backup fails with permission denied

**Check:** Script is executable?

```bash
ls -la /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh
```

Fix:

```bash
chmod +x /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/backup.sh
```

### Issue: Disk space running low

**Check:** Current backup sizes:

```bash
du -h ~/Desktop/kenyonexpress-backup-*.tar.gz
```

If >2.7 GB total, manually remove old backups:

```bash
ls -t ~/Desktop/kenyonexpress-backup-*.tar.gz | tail -n +4 | xargs rm
```

---

## Maintenance Schedule

### Daily (Automated)

- 04:54 UTC+7: Create backup
- 14:54 UTC+7: Create backup
- Cron automatically rotates to keep 3 most recent

### Weekly (Manual)

```bash
pnpm backup:health
```

Verify backup health and RPO status.

### Monthly

Run full restore drill:

```bash
pnpm backup:restore
```

Validate RTO and restore procedure (documented in `docs/BACKUP-RESTORE-DRILL.md`).

---

## Current Status (As of 2026-10-18)

**Backup Inventory:**
- ✅ kenyonexpress-backup-2026-10-17-0454.tar.gz (852.6 MB, 13h old)
- ✅ kenyonexpress-backup-2026-10-16-2107.tar.gz (851.4 MB, 21h old)
- ✅ kenyonexpress-backup-2026-10-16-1935.tar.gz (850.9 MB, 23h old)

**Ready for:**
- [ ] Cron installation (manual setup required)
- [ ] Twice-daily backup schedule deployment
- [ ] Automated backup health monitoring integration

---

## References

- **Backup script:** `scripts/backup.sh`
- **Health check:** `scripts/backup-health-check.mjs`
- **Restore script:** `scripts/restore-from-backup.mjs`
- **Restore procedure:** `docs/BACKUP-RESTORE-DRILL.md`
- **Logs:** `/tmp/kenyonexpress-backup.log`

---

## Implementation Checklist

- [ ] Make script executable: `chmod +x scripts/backup.sh`
- [ ] Install cron jobs via `crontab -e`
- [ ] Verify cron: `crontab -l | grep kenyonexpress`
- [ ] Test backup: `/path/to/backup.sh`
- [ ] Check logs: `tail /tmp/kenyonexpress-backup.log`
- [ ] Daily health check: `pnpm backup:health`
- [ ] Monitor first 48 hours for any issues
- [ ] Update observability cron for automated health checks (future)

**Estimated Setup Time:** 5 minutes (mostly manual steps)
