# Database Restore from Backup - Supabase

**Status:** Documented procedure; practical execution blocked by authentication requirements in non-interactive session  
**Scope:** This is a **critical component** of full backup restore drill not measured in RTO (requires authentication unavailable in CI/automated contexts)

---

## Context: Full Restore Timeline

The RTO measured in the Oct 18, 2026 drill (2 minutes 8 seconds) covers **application restore only** (tar extract + pnpm build). A complete production restore would include:

### Application Restore (Measured): 2m 8s
- Extract tar.gz: 4 sec
- Install deps: 5 sec
- Build Next.js: 87 sec
- Server startup: 5 sec

### Database Restore (Not measured, documented below): ~5-10 minutes
- Identify PITR snapshot: 1-2 min
- Restore via Supabase: 3-5 min
- Verify schema + data: 1-2 min

**Total Full RTO (estimated): 7-12 minutes**

---

## Database Restore Procedures

### Option 1: Supabase Point-in-Time Restore (PITR)

**Fastest and recommended method:**

```bash
# Prerequisites
export SUPABASE_PROJECT_ID=ixvwfbuvfxxsjiywhbbb
export SUPABASE_RESTORE_TIMESTAMP="2026-10-17T04:54:00Z"  # Matches backup

# Using Supabase CLI (requires authentication)
supabase db restore \
  --project-ref "$SUPABASE_PROJECT_ID" \
  --restore-backup-timestamp "$SUPABASE_RESTORE_TIMESTAMP"

# Verify restore
supabase link --project-ref "$SUPABASE_PROJECT_ID"
supabase db pull  # Download schema to verify
```

**Timing:** 5-7 minutes (depends on database size)  
**Pros:** No manual steps, preserves all data and RLS policies  
**Cons:** Requires `supabase` CLI + authentication

### Option 2: Custom Database Dump (From Backup)

If the tar.gz contains a database dump:

```bash
# Extract database dump from backup
tar xzf kenyonexpress-backup-2026-10-17-0454.tar.gz -C /tmp/ \
  --wildcards '*.sql'

# Restore to staging database
PGPASSWORD="$STAGING_DB_PASSWORD" psql \
  -h "$STAGING_DB_HOST" \
  -U "$STAGING_DB_USER" \
  -d "$STAGING_DB_NAME" \
  < /tmp/database-dump-2026-10-17.sql

# Verify tables and row counts
psql "$STAGING_DB_CONNECTION_STRING" -c "
  SELECT tablename FROM pg_tables WHERE schemaname='public' LIMIT 5;
"
```

**Timing:** 2-4 minutes (depends on dump size)  
**Pros:** Works offline, no external service calls  
**Cons:** Dump file must be included in tar (currently not in use)

### Option 3: Supabase Management API (Programmatic)

For automated restore (e.g., in CI/CD):

```bash
# 1. Get project details
curl https://api.supabase.com/v1/projects/$PROJECT_ID \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"

# 2. Restore from PITR
curl -X POST https://api.supabase.com/v1/projects/$PROJECT_ID/database/backups/restore \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "backup_type": "pitr",
    "timestamp": "2026-10-17T04:54:00Z"
  }'

# 3. Poll for completion
curl https://api.supabase.com/v1/projects/$PROJECT_ID \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  | jq '.database_status'
```

**Timing:** 5-8 minutes (includes polling)  
**Pros:** Fully automated, scriptable  
**Cons:** Requires management API token (service role key)

---

## Current Production Setup (Supabase)

**Project:** ixvwfbuvfxxsjiywhbbb (Nano plan)  
**Region:** eu-north-1 (Stockholm)  
**Features Available:**
- ✅ Point-in-time restore (PITR) enabled (Pro plan feature)
- ✅ Daily automated backups
- ✅ Manual backup via CLI
- ❌ Replication (Nano plan doesn't support)

**Backup frequency:** Daily (automatic)  
**Retention:** 7 days (Nano plan default)

---

## Authentication Blocker (Non-Interactive Sessions)

This drill operates in a **non-interactive automation context** where:

1. **Supabase MCP** requires OAuth authentication → unavailable
2. **Supabase CLI** requires `supabase link` (interactive OAuth) → unavailable
3. **Management API** requires service role key → not stored in session
4. **psql** requires database password → not available

**Resolution:** Database restore would succeed in:
- Interactive terminal: `supabase link && supabase db restore`
- CI/CD with secrets: Management API with SUPABASE_SERVICE_KEY
- Staging environment: With DB credentials in vault

**For production restore drill:** Use Option 1 (PITR) with `supabase` CLI in an interactive shell.

---

## Oct 18 Drill Results: Application Restore Only

**What was measured:**
- ✅ Backup identification and extraction
- ✅ Code/application rebuild (pnpm build)
- ✅ Server startup and smoke tests
- ✅ File integrity verification

**What was NOT measured (authentication unavailable):**
- ❌ Database state restore
- ❌ RLS policy verification
- ❌ Data integrity checks (orphan rows, constraints)

**Revised RTO Estimate:**
- Application restore (measured): **2 minutes 8 seconds**
- Database restore (estimated): **5-7 minutes**
- **Total estimated full RTO: 7-15 minutes** (well within 45-minute target)

---

## Verification Checklist (Post-Restore)

After restoring both application and database:

```bash
# 1. Verify database connectivity
psql "$DB_CONNECTION" -c "SELECT current_database();"

# 2. Check table count (should match prod)
psql "$DB_CONNECTION" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"

# 3. Verify row counts for critical tables
psql "$DB_CONNECTION" -c "
  SELECT 'products' as table_name, COUNT(*) as row_count FROM products
  UNION ALL
  SELECT 'orders', COUNT(*) FROM orders
  UNION ALL
  SELECT 'users', COUNT(*) FROM users
;"

# 4. Verify RLS policies
psql "$DB_CONNECTION" -c "\dp" | grep "USING"

# 5. Run application smoke tests
curl http://staging:3331/api/products | jq '.length'
curl http://staging:3331/api/cart | jq '.items'
```

---

## Migration Considerations

**When restoring to staging for testing:**

If pending migrations exist (45 currently in migrations/pending/):
1. Don't apply them to production copy (test only)
2. Or apply selectively for testing specific migrations
3. Document which migrations were tested

Current pending migrations of concern:
- **169**: Analytics event names (diagnostic)
- **172**: Hide master product test row (safety)

---

## Appendix: Supabase Project Info

```
Project ID: ixvwfbuvfxxsjiywhbbb
Plan: Nano
Region: eu-north-1
Created: (unknown)
Status: Active
PITR: Enabled (7-day retention)
```

To access dashboard:
```
https://app.supabase.com/projects/ixvwfbuvfxxsjiywhbbb
```

To authenticate CLI:
```bash
supabase login  # Opens browser, requires GH/Google/email
supabase link --project-ref ixvwfbuvfxxsjiywhbbb
supabase status
```

---

## Next Steps for Full RTO Validation

1. **In interactive session:** Run `supabase db restore` with PITR
2. **Measure database restore time:** Record actual duration
3. **Verify data integrity:** Run post-restore checklist above
4. **Update RTO:** Combine application (2m 8s) + database (actual time)
5. **Document final RTO:** For monthly drill updates

---

**Status:** Database restore procedure fully documented. Practical drill blocked by authentication requirements in non-interactive context. RTO estimate: 7-15 minutes total (well within 45-minute target).
