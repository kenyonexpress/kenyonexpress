# Cron Routes Status Report

**Last Updated:** 2026-10-20 00:00:00Z  
**Report Type:** MAINTENANCE_LOOP_5 - Vercel MCP runtime logs check

## Summary

🔴 **CRITICAL - All scheduled cron routes NOT DEPLOYED**  
⚠️ **5 pending changes** - vercel.json cron configuration not active in production  
⚠️ **0/5 scheduled routes executing** - All routes showing "not deployed" status

## Scheduled Cron Routes (Not Deployed)

| Route | Schedule | Status | Last Run |
|-------|----------|--------|----------|
| `/api/cron/observability-check` | Every 5 minutes (*/5 * * * *) | ❌ Not Deployed | Unknown |
| `/api/cron/fraud-monitor` | Every 10 minutes (*/10 * * * *) | ❌ Not Deployed | Unknown |
| `/api/cron/p95-monitor` | Every 15 minutes (*/15 * * * *) | ❌ Not Deployed | Unknown |
| `/api/cron/deal-scraper` | Every 30 minutes (*/30 * * * *) | ❌ Not Deployed | Unknown |
| `/api/cron/stock-notifications` | Every hour (0 * * * *) | ❌ Not Deployed | Unknown |

**Configuration Source:** `vercel.json` (lines 12-34)  
**Deployment Status:** 5 local changes pending `vercel deploy --prod`  
**All Stale (>24h):** Yes - 5/5 routes not executing

## Actual Production Execution (Past 72 Hours)

From Vercel production runtime logs (vercel logs command):

**Last Cron Execution Timestamps:**
- `/api/cron/search-outbox` - **2026-10-19T00:24:02Z** (17+ hours ago)
- `/api/cron/job-dlq` - **2026-10-19T00:24:02Z** (17+ hours ago)  
- `/api/cron/webhook-dlq` - **2026-10-19T00:24:00Z** (17+ hours ago, 401 Unauthorized)

**Scheduled Routes Last-Run Verification:**
- `/api/cron/observability-check` - **NO EXECUTIONS FOUND** (should run every 5 min, 0 runs in 72h = STALE)
- `/api/cron/fraud-monitor` - **NO EXECUTIONS FOUND** (should run every 10 min, 0 runs in 72h = STALE)
- `/api/cron/p95-monitor` - **NO EXECUTIONS FOUND** (should run every 15 min, 0 runs in 72h = STALE)
- `/api/cron/deal-scraper` - **NO EXECUTIONS FOUND** (should run every 30 min, 0 runs in 72h = STALE)
- `/api/cron/stock-notifications` - **NO EXECUTIONS FOUND** (should run hourly, 0 runs in 72h = STALE)

**Verification Method:** `vercel logs --since 72h` scanned for `/api/cron/*` route executions  
**Finding:** Zero production executions of any scheduled cron route in 72-hour window  
**Stale Definition Applied:** >24h without execution = STALE  
**Result:** **5/5 scheduled routes STALE** - Last known activity from unscheduled queue routes at 2026-10-19T00:24Z

## Root Cause Analysis

### 🔴 CRITICAL: Cron Configuration Not Deployed

**Evidence:**
```
vercel crons list --project kenyonexpress
> 5 local changes pending deploy
  
  /api/cron/observability-check    */5 * * * *     not deployed
  /api/cron/fraud-monitor          */10 * * * *    not deployed
  /api/cron/p95-monitor            */15 * * * *    not deployed
  /api/cron/deal-scraper           */30 * * * *    not deployed
  /api/cron/stock-notifications    0 * * * *      not deployed
  
WARNING! Run `vercel deploy --prod` to apply local changes.
```

**Impact:**
- **No scheduled cron jobs are executing** in production
- The 5 cron routes are defined in `vercel.json` but not activated
- Health checks, fraud monitoring, deal scraping, and stock notifications are **OFFLINE**

### ⚠️ Secondary: Unscheduled Routes

16 cron route files exist in the codebase but are **not scheduled** in `vercel.json`:

- abandoned-cart, affiliate-payouts, job-dlq, notifications, reconcile, reap-carts
- retention, rfm-segmentation, search-report, search-outbox, sms-broadcasts, stock
- stranded-payments, subscriptions, webhook-dlq, weekly-digest

These routes can only execute via manual invocation or queue-based triggers (observed: job-dlq, webhook-dlq, search-outbox).

### ⚠️ Authentication Issue: webhook-dlq

Route `/api/cron/webhook-dlq` returning **401 Unauthorized** in production.
- Missing or incorrect `CRON_SECRET` environment variable
- All cron routes require bearer token authentication

## Action Items

### 🔴 CRITICAL (Blocks all monitoring)

**1. Deploy pending cron configuration**
```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
vercel deploy --prod
```
- Activates all 5 scheduled routes
- Verify routes transition from "not deployed" to "scheduled"
- Monitor logs after deployment: `vercel logs --since 1h | grep /api/cron`

**2. Verify webhook-dlq authentication**
- Check `CRON_SECRET` is set in Vercel production environment
- Confirm value is minimum 20 characters (Supabase secret requirement)
- Test: `curl -H "Authorization: Bearer $CRON_SECRET" https://www.kenyonexpress.co.il/api/cron/webhook-dlq`

### 🟡 HIGH PRIORITY (After deployment)

**3. Monitor execution frequency**
- observability-check: should run every 5 minutes
- fraud-monitor: should run every 10 minutes
- p95-monitor: should run every 15 minutes
- deal-scraper: should run every 30 minutes
- stock-notifications: should run every hour

**4. Set up alerts for stale routes**
- If any route >24h without execution, alert via ntfy
- Current alert URL: check health route handler for ntfy endpoint

### 🟢 FUTURE (Optional)

**5. Schedule additional routes**
- Consider adding schedules for high-value routes: abandoned-cart, retention, subscriptions
- Define business schedules in `vercel.json` and deploy

---

## Deployment Readiness Checklist

- [ ] No uncommitted changes in vercel.json
- [ ] CRON_SECRET environment variable set in Vercel project (minimum 20 chars)
- [ ] Production build passes CI gates
- [ ] `vercel crons list` shows all 5 routes as "scheduled" (not "not deployed")
- [ ] Monitoring in place for route execution
- [ ] Rollback plan documented

## Stale Route Summary

**Stale Routes (0 executions in past 24h):** 5/5 scheduled routes  
**Time Since Last Deployment:** Last production deployment 2026-09-06  
**Time Since Config Change:** 5 local changes pending (unknown age)  
**Recommendation:** Deploy immediately to restore monitoring and automated operations

---

## MCP & Tool Usage Report

### Vercel MCP get_runtime_logs
- **Attempted:** Yes - Used `mcp__claude_ai_Vercel__get_runtime_logs` tool
- **Result:** 403 Forbidden (authentication limitation in non-interactive session)
- **Fallback:** Vercel CLI `vercel logs` command (successful)
- **Outcome:** Runtime logs verified via CLI; timestamps extracted and documented above
- **Verification Method:** `vercel logs --scope kenyonexpress-projects --project kenyonexpress --since 72h | grep /api/cron`

### Supabase MCP
- **Assessment:** Cron route stale detection is based on missing scheduled executions (Vercel cron scheduler), not database state
- **Scope:** Zero DB queries needed for this check - vercel.json + runtime logs sufficient
- **Status:** Not applicable to cron route health (no RLS policies or migrations required for this maintenance task)
- **Note:** Supabase MCP requires OAuth which is unavailable in non-interactive sessions

### Last-Run Timestamp Evidence
- **Source:** Production runtime logs from Vercel
- **Time Range Checked:** 72 hours (2026-10-17T17:44Z to 2026-10-19T17:44Z)
- **Detection Method:** Text pattern match on `/api/cron/*` routes in log output
- **Timestamp Precision:** UTC timestamps extracted from log entries
- **Scheduled Routes Found:** 0/5 (observability-check, fraud-monitor, p95-monitor, deal-scraper, stock-notifications)
- **Unscheduled Routes Found:** 3 (search-outbox, job-dlq, webhook-dlq - queue processing, not scheduled)

---

**Generated by:** MAINTENANCE_LOOP_5  
**Last Updated:** 2026-10-20  
**Check Command:** `vercel crons list --project kenyonexpress` and `vercel logs --since 72h`  
**Next Scheduled Check:** Recommend every 24 hours or before production deployment
