# Cron Routes Status (2026-10-27)

## Runtime Logs Check via Vercel CLI (Fresh)

**Check Date:** 2026-10-27 14:05 UTC (21:05 local time)  
**Time Window:** Last 24 hours (2026-10-26 14:05 → 2026-10-27 14:05 UTC)  
**Method:** Vercel CLI `logs --since 24h` with cron route filtering  
**Project:** kenyonexpress (prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP)  
**Environment:** Production  

## Status Summary

**Health Status:** ⚠️ **CRITICAL** — 15 of 22 routes (68%) STALE over 24h

| Status | Count | Routes |
|--------|-------|--------|
| ✅ Healthy (<24h) | 7 | health, invoices, notifications, stock, stranded-payments, abandoned-cart, stock-notifications |
| ⛔ Stale (>24h) | 15 | affiliate-payouts, deal-scraper, expire-vouchers, fraud-monitor, observability-check, p95-monitor, reap-carts, reconcile, retention, rfm-segmentation, scheduled-gifts, search-report, sms-broadcasts, subscriptions, weekly-digest |
| **Total** | **22** | **From scripts/cron-jobs.json** |

## Healthy Routes (Ran in Last 24 Hours)

| Route | Schedule | Last Run | Status |
|-------|----------|----------|--------|
| ✅ `/api/cron/health` | Every 5 min | 21:05:00 local (~30s ago) | Healthy |
| ✅ `/api/cron/notifications` | Every 5 min | 21:05:00 local (~30s ago) | Healthy |
| ✅ `/api/cron/invoices` | Every 10 min | 21:00:00 local (~5m 30s ago) | Healthy |
| ✅ `/api/cron/abandoned-cart` | Hourly | 21:00:00 local (~5m 30s ago) | Healthy |
| ✅ `/api/cron/stock` | Every 10 min | 21:00:00 local (~5m 30s ago) | Healthy |
| ✅ `/api/cron/stranded-payments` | Every 10 min | 21:00:00 local (~5m 30s ago) | Healthy |
| ✅ `/api/cron/stock-notifications` | Hourly | 20:58:57 local (~6-7m ago) | Healthy |

## Stale Routes (No Runs in 24+ Hours)

| Route | Schedule | Severity | Impact |
|-------|----------|----------|--------|
| ⛔ `/api/cron/affiliate-payouts` | 3:40 AM | Creator payments | Commissions not being paid out |
| ⛔ `/api/cron/deal-scraper` | Every 30 min | Content updates | Deal catalog stale |
| ⛔ `/api/cron/expire-vouchers` | 11:15 PM | Data integrity | Expired vouchers not marked |
| ⛔ `/api/cron/fraud-monitor` | Every 10 min | Security ⚠️ CRITICAL | Fraud detection disabled |
| ⛔ `/api/cron/observability-check` | Every 5 min | Monitoring ⚠️ CRITICAL | System health not monitored |
| ⛔ `/api/cron/p95-monitor` | Every 15 min | Performance | Performance tracking offline |
| ⛔ `/api/cron/reap-carts` | 3:40 AM | Cleanup | Old carts accumulating |
| ⛔ `/api/cron/reconcile` | 4:00 AM | Finance | Daily reconciliation skipped |
| ⛔ `/api/cron/retention` | 5:00 AM (monthly) | Marketing | Retention campaigns not running |
| ⛔ `/api/cron/rfm-segmentation` | 1:20 AM | Analytics | RFM segments stale |
| ⛔ `/api/cron/scheduled-gifts` | Not scheduled | Features | Scheduled gifts not processing |
| ⛔ `/api/cron/search-report` | 6:00 AM (Mondays) | Analytics | Search analytics reports offline |
| ⛔ `/api/cron/sms-broadcasts` | Every 10 min | Communications | SMS broadcasts blocked |
| ⛔ `/api/cron/subscriptions` | 2:30 AM | Billing | Subscription renewals not processed |
| ⛔ `/api/cron/weekly-digest` | 4:00 AM (Fridays) | Marketing | Weekly digests not sent |

## Root Cause Analysis

**Partial Cron Functionality:**
- **7 routes running:** health, notifications, invoices, stock, stranded-payments, abandoned-cart, stock-notifications
- **15 routes stale (>24h):** All others in the defined job list
- **Unusual anomaly:** search-reindex route appears in logs but is NOT defined in `scripts/cron-jobs.json`

**Hypothesis:**
Production deployment likely contains a different/older version of `scripts/cron-jobs.json` that includes only a subset of jobs, or the deployment branch differs from the local closeout/v1-final branch. The 7 healthy routes may be the only ones defined in the currently deployed version.

**Evidence:**
- Previous check (2026-10-27 17:24 UTC) showed same 5 core routes running
- This check (2026-10-27 14:05 UTC) shows 7 routes — 2 additional routes now visible (abandoned-cart, stock-notifications)
- 15 routes have zero recorded executions in 24-hour window

**Branch Configuration Known Issue:**
- **Vercel auto-deploy:** Previously deployed from `audit/final-audit` branch with empty cron jobs
- **Current status:** Unknown which branch is now active; logs show some jobs running but not all defined ones

## Impact Assessment

**Critical Business Functions (STALE - No Runs in 24h):**
- ⛔ **Fraud detection** — security monitoring disabled
- ⛔ **System observability** — health checks offline
- ⛔ **Affiliate commissions** — creator payments overdue
- ⛔ **SMS broadcasts** — customer communications blocked
- ⛔ **Finance reconciliation** — daily accounting skipped
- ⛔ **Search monitoring** — analytics reports offline

**Working Functions (HEALTHY - Running):**
- ✅ Health checks every 5 minutes
- ✅ Notification delivery every 5 minutes
- ✅ Invoice generation every 10 minutes
- ✅ Stock level updates every 10 minutes
- ✅ Stranded payment recovery every 10 minutes
- ✅ Abandoned cart recovery (now visible)
- ✅ Stock notifications (now visible)

## Resolution Required

**Action 1:** Verify deployed branch configuration
```bash
vercel projects list --scope kenyonexpress
vercel logs --project kenyonexpress --since 1h | grep "cron"
```

**Action 2:** Ensure production deploys full cron-jobs.json
- Verify `audit/final-audit` branch is NOT the deployment source
- Switch to `origin/main` or `closeout/v1-final` if needed
- Confirm all 22 routes appear in deployment manifest

**Action 3:** Monitor for stale route recovery
- After deployment: `vercel logs --since 1h` should show all 22 routes
- If routes remain stale: Check next.config.ts cron job definitions
- If search-reindex is phantom: Remove from logs or add to cron-jobs.json

**Blocker:** Requires manual Vercel dashboard access or team permissions to change deployment source

---
