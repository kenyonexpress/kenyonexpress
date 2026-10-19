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

## Actual Production Execution (Past 24 Hours)

From Vercel runtime logs:

| Route | Last Execution | Status |
|-------|----------------|--------|
| `/api/cron/search-outbox` | 2026-10-19T17:24:02Z (~24 min ago) | ✅ OK |
| `/api/cron/job-dlq` | 2026-10-19T17:24:02Z (~24 min ago) | ✅ OK |
| `/api/cron/webhook-dlq` | 2026-10-19T17:24:00Z (~24 min ago) | ⚠️ 401 Unauthorized |

**Note:** Only 3 queue-processing routes visible; **0 of 5 scheduled routes** from vercel.json appear in logs.

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

**Generated by:** MAINTENANCE_LOOP_5  
**Check Command:** `vercel crons list --project kenyonexpress`  
**Next Scheduled Check:** When run again (recommend: every 24 hours)
