# pg_cron + pg_net Setup Guide

**Status:** Ready for deployment  
**Prerequisites:** Migration 130 applied, Supabase Pro plan  
**Objective:** Replace Vercel cron with in-database scheduling for queue processing, reminders, and outbox draining

---

## Overview

This system uses PostgreSQL's `pg_cron` extension to schedule recurring jobs and `pg_net` to make HTTP calls to internal cron endpoints. It provides:

1. **Notification outbox drain** - Email, push, and WhatsApp delivery (every 5 minutes)
2. **Search index outbox drain** - Meilisearch sync + health checks (every 5 minutes)
3. **Voucher reminders** - Expiry processing and wallet credits (daily at 02:00 UTC)
4. **Backup pointer** - RPO tracking via `backup_log` table
5. **pg_net cleanup** - Purge old HTTP responses (daily at 03:00 UTC)

---

## Installation Steps

### 1. Apply Migration 130

Via Supabase MCP:

```bash
# Apply the migration that creates extensions, functions, and tables
supabase_mcp apply_migration --path supabase/migrations/130_pg_cron_pg_net.sql
```

Or via SQL Editor in Supabase Dashboard:

```sql
-- Copy and run the contents of supabase/migrations/130_pg_cron_pg_net.sql
```

**What this creates:**
- `pg_cron` and `pg_net` extensions
- `backup_log` table for RPO tracking
- `fn_drain_notification_outbox()` - calls /api/cron/notifications
- `fn_drain_search_outbox()` - calls /api/cron/health
- `fn_process_voucher_reminders()` - calls /api/cron/expire-vouchers
- `fn_record_backup()` - records backup metadata
- `backup_status` view - current RPO calculation

### 2. Configure Database Settings

Set the application URL and cron secret so `pg_net` can call your endpoints:

```sql
-- PRODUCTION
ALTER DATABASE postgres SET app.settings.app_url = 'https://kenyonexpress.co.il';
ALTER DATABASE postgres SET app.settings.cron_secret = '<your-CRON_SECRET>';

-- STAGING
ALTER DATABASE postgres SET app.settings.app_url = 'https://staging.kenyonexpress.co.il';
ALTER DATABASE postgres SET app.settings.cron_secret = '<staging-CRON_SECRET>';

-- LOCAL (for testing)
ALTER DATABASE postgres SET app.settings.app_url = 'http://localhost:3000';
ALTER DATABASE postgres SET app.settings.cron_secret = '<local-test-secret>';
```

**Security:** The `CRON_SECRET` must match the value in your Vercel environment variables. These settings are database-level and persist across connections.

### 3. Schedule the Jobs

Run the schedule file to create all cron jobs:

```sql
-- Copy and run the contents of supabase/schedules/cron_jobs.sql
```

Or via psql:

```bash
psql "$DATABASE_URL" < supabase/schedules/cron_jobs.sql
```

**What this schedules:**
- `drain_notification_outbox` - every 5 minutes
- `drain_search_outbox` - every 5 minutes
- `process_voucher_reminders` - daily at 02:00 UTC (09:00 Israel winter)
- `cleanup_pg_net_responses` - daily at 03:00 UTC

---

## Verification

### Check Extensions Installed

```sql
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('pg_cron', 'pg_net');
```

Expected output:
```
  extname  | extversion 
-----------+------------
 pg_cron   | 1.6
 pg_net    | 0.9
```

### List Scheduled Jobs

```sql
SELECT jobid, jobname, schedule, active, database 
FROM cron.job 
ORDER BY jobname;
```

Expected output:
```
 jobid |          jobname           |  schedule   | active | database 
-------+----------------------------+-------------+--------+----------
     1 | cleanup_pg_net_responses   | 0 3 * * *   | t      | postgres
     2 | drain_notification_outbox  | */5 * * * * | t      | postgres
     3 | drain_search_outbox        | */5 * * * * | t      | postgres
     4 | process_voucher_reminders  | 0 2 * * *   | t      | postgres
```

### Check Recent Job Runs

```sql
SELECT 
  jobid, 
  jobname, 
  status, 
  start_time, 
  end_time,
  return_message
FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

**Success indicators:**
- `status = 'succeeded'`
- `return_message IS NULL` or contains no errors
- Jobs running at expected intervals

### Check pg_net HTTP Calls

```sql
SELECT 
  id,
  created,
  status_code,
  (content::jsonb->>'ok')::boolean AS ok,
  error_msg
FROM net._http_response
ORDER BY created DESC
LIMIT 20;
```

**Success indicators:**
- `status_code = 200`
- `ok = true`
- `error_msg IS NULL`

### Verify Backup Pointer

```sql
-- Record a test backup
SELECT public.fn_record_backup(
  'manual',
  '/test/verification-backup.tar.gz',
  100000000,
  'admin@test'
);

-- Check backup status
SELECT * FROM public.backup_status;
```

Expected output:
```
 id | backup_type |          location           | size_bytes | last_backup_time | rpo_hours | created_by 
----+-------------+-----------------------------+------------+------------------+-----------+------------
  1 | manual      | /test/verification-backup...| 100000000  | 2026-10-24...    | 0.001     | admin@test
```

---

## Monitoring

### Daily Health Check

Add this to your monitoring dashboard:

```sql
-- Current RPO
SELECT * FROM public.backup_status;

-- Failed cron jobs in last 24 hours
SELECT 
  jobname, 
  COUNT(*) AS failures,
  MAX(start_time) AS last_failure
FROM cron.job_run_details 
WHERE status = 'failed' 
  AND start_time > now() - interval '24 hours'
GROUP BY jobname;

-- Failed HTTP calls in last 24 hours
SELECT 
  COUNT(*) AS failed_calls,
  jsonb_object_keys(content::jsonb) AS endpoint
FROM net._http_response
WHERE status_code != 200
  AND created > now() - interval '24 hours'
GROUP BY endpoint;
```

### Alert Conditions

Set up alerts (via Supabase Dashboard → Database → Webhooks or external monitoring):

1. **Job failure:** Any job in `cron.job_run_details` with `status = 'failed'`
2. **HTTP errors:** Any response in `net._http_response` with `status_code != 200`
3. **Stale RPO:** `backup_status.rpo_hours > 24` (no backup in 24 hours)
4. **Job not running:** No entries in `cron.job_run_details` for a job in last hour

---

## Troubleshooting

### Jobs Not Running

**Symptom:** No entries in `cron.job_run_details`

**Check:**
```sql
-- Are jobs active?
SELECT jobid, jobname, active FROM cron.job;
```

**Fix:**
```sql
-- If active = false, re-run the schedule file
-- Or manually activate:
UPDATE cron.job SET active = true WHERE jobname = 'drain_notification_outbox';
```

### HTTP Calls Failing

**Symptom:** `status_code != 200` in `net._http_response`

**Check database settings:**
```sql
SELECT name, setting 
FROM pg_settings 
WHERE name LIKE 'app.settings.%';
```

**Common issues:**
1. Wrong `app_url` (localhost vs production)
2. Wrong `cron_secret` (doesn't match Vercel env var)
3. Firewall blocking `pg_net` outbound connections
4. Endpoint is down (check Vercel deployment status)

**Fix:**
```sql
-- Update settings
ALTER DATABASE postgres SET app.settings.app_url = 'https://correct-url.com';
ALTER DATABASE postgres SET app.settings.cron_secret = 'correct-secret';

-- Force reconnection to pick up new settings
SELECT pg_reload_conf();
```

### Permission Errors

**Symptom:** `ERROR: permission denied` in `return_message`

**Check grants:**
```sql
-- Check function ownership
SELECT proname, proowner::regrole 
FROM pg_proc 
WHERE proname LIKE 'fn_drain%' OR proname LIKE 'fn_process%';

-- Check cron schema access
SELECT nspname, nspowner::regrole 
FROM pg_namespace 
WHERE nspname = 'cron';
```

**Fix:**
```sql
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;
```

### Cleanup Old Data

**pg_net responses growing too large:**

```sql
-- Manual cleanup (keeps last 7 days)
DELETE FROM net._http_response 
WHERE created < now() - interval '7 days';

-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('net._http_response'));
```

**Old backup_log entries:**

```sql
-- Keep last 90 days of backup logs
DELETE FROM public.backup_log 
WHERE created_at < now() - interval '90 days'
  AND status = 'completed';
```

---

## Manual Job Control

### Disable a Job

```sql
SELECT cron.unschedule('drain_notification_outbox');
```

### Re-enable a Job

```sql
SELECT cron.schedule(
  'drain_notification_outbox',
  '*/5 * * * *',
  $$SELECT public.fn_drain_notification_outbox()$$
);
```

### Run a Job Immediately

```sql
-- Test notification outbox drain
SELECT public.fn_drain_notification_outbox();

-- Test search outbox drain
SELECT public.fn_drain_search_outbox();

-- Test voucher reminders
SELECT public.fn_process_voucher_reminders();
```

### Check What a Function Will Do

```sql
-- See the pg_net request it will make
SELECT 
  current_setting('app.settings.app_url') || '/api/cron/notifications' AS url,
  'Bearer ' || current_setting('app.settings.cron_secret') AS auth_header;
```

---

## Rollback / Disable

### Temporary Disable (keep schema)

```sql
-- Unschedule all jobs
SELECT cron.unschedule('drain_notification_outbox');
SELECT cron.unschedule('drain_search_outbox');
SELECT cron.unschedule('process_voucher_reminders');
SELECT cron.unschedule('cleanup_pg_net_responses');
```

Vercel cron will continue to work as fallback.

### Full Rollback (remove everything)

**⚠️ WARNING:** This removes all backup logs and job history.

```sql
-- Drop schedules
SELECT cron.unschedule(jobname) FROM cron.job;

-- Drop functions
DROP FUNCTION IF EXISTS public.fn_drain_notification_outbox();
DROP FUNCTION IF EXISTS public.fn_drain_search_outbox();
DROP FUNCTION IF EXISTS public.fn_process_voucher_reminders();
DROP FUNCTION IF EXISTS public.fn_record_backup(text, text, bigint, text);

-- Drop tables
DROP VIEW IF EXISTS public.backup_status;
DROP TABLE IF EXISTS public.backup_log;

-- Drop extensions
DROP EXTENSION IF EXISTS pg_cron;
DROP EXTENSION IF EXISTS pg_net;
```

---

## Integration with External Backup Scripts

Update your backup scripts to record completion:

```bash
#!/bin/bash
# Example: scripts/backup.sh

# ... existing backup logic ...

# Record backup in database
psql "$DATABASE_URL" -c "
  SELECT public.fn_record_backup(
    'pg_dump',
    '$BACKUP_PATH',
    $BACKUP_SIZE_BYTES,
    'cron@system'
  );
"
```

Or via Supabase client:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, serviceRoleKey)

await supabase.rpc('fn_record_backup', {
  p_backup_type: 'pg_dump',
  p_location: backupPath,
  p_size_bytes: backupSizeBytes,
  p_created_by: 'github-actions',
})
```

---

## Performance Notes

### Resource Usage

- **pg_cron:** Negligible (just schedules SQL commands)
- **pg_net:** ~1-2 MB per HTTP call in `net._http_response`
- **Cleanup job:** Runs daily to prevent unbounded growth

### Scaling

Current setup handles:
- 50 notification outbox rows per 5 minutes = ~14,400/day
- 50 search index jobs per 5 minutes = ~14,400/day
- 500 voucher credits per daily run

If queues grow beyond these limits:
1. Increase batch sizes in cron endpoint route.ts files
2. Decrease cron intervals (e.g., every 2 minutes instead of 5)
3. Add more cron workers (requires pg_cron configuration)

---

## References

- **Migration:** `supabase/migrations/130_pg_cron_pg_net.sql`
- **Schedule:** `supabase/schedules/cron_jobs.sql`
- **Tests:** `src/lib/backup/backup-pointer.test.ts`
- **pg_cron docs:** https://github.com/citusdata/pg_cron
- **pg_net docs:** https://github.com/supabase/pg_net
- **Supabase cron guide:** https://supabase.com/docs/guides/database/extensions/pg_cron

---

## Next Steps

1. ✅ Apply migration 130
2. ✅ Configure database settings
3. ✅ Schedule jobs via `cron_jobs.sql`
4. ✅ Verify jobs are running
5. ⏳ Monitor for 24 hours
6. ⏳ Update backup scripts to call `fn_record_backup()`
7. ⏳ Set up alerts for job failures
8. ⏳ Document in runbook
9. ⏳ Train team on monitoring queries
10. ⏳ Consider disabling Vercel cron (keep as fallback initially)
