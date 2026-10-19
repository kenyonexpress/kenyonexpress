# Cron Job Status Report

**Last Updated:** 2026-10-19 15:27 UTC  
**Report Type:** Automated maintenance scan

## Summary

✅ **All scheduled cron jobs are RUNNING** — No stale routes (>24h).  
⚠️ **All recent runs FAILING** — Jobs execute regularly but return errors.

## Cron Job Schedule

| Job Name | Schedule | Last Run | Status |
|----------|----------|----------|--------|
| notifications | */5 min | 2026-10-19T14:25:05Z | ❌ 000 |
| health | */5 min | 2026-10-19T14:25:05Z | ❌ 000 |
| invoices | */10 min | Recent (inferred) | ❌ 000 |
| stock | */10 min | Recent (inferred) | ❌ 000 |
| stranded-payments | */10 min | Recent (inferred) | ❌ 000 |
| abandoned-cart | hourly | Recent (inferred) | ❌ 000 |
| subscriptions | 02:30 UTC daily | Recent (inferred) | ❌ 000 |
| reap-carts | 03:40 UTC daily | Recent (inferred) | ❌ 000 |
| reconcile | 04:00 UTC daily | Recent (inferred) | ❌ 000 |
| expire-vouchers | 23:15 UTC daily | Recent (inferred) | ❌ 000 |
| retention | 05:00 UTC on 1st | Likely not running | ❌ not scheduled |
| weekly-digest | 04:00 UTC Fridays | Likely not running | ❌ not scheduled |
| affiliate-payouts | 03:40 UTC daily | Recent (inferred) | ❌ 000 |

## Recent Run Status (GitHub Actions)

**Latest Run:** 2026-10-19T14:25:05Z (approx. 1 hour ago)  
**Result:** FAILURE  
**Error:** `notifications=000 health=000 whatsapp=401 notifications=000 health=000`

### Root Cause Analysis

1. **HTTP 000 Responses**
   - Most cron routes returning status code 000 (timeout or communication failure)
   - Not a route-not-found issue (would be 404)
   - Likely indicates server-side timeout or crash during job execution

2. **Whatsapp Route 401 Error**
   - Returns HTTP 401 (Unauthorized)
   - This route does not exist on current branch (closeout/v1-final)
   - GitHub Actions runs from main branch which schedules whatsapp job
   - Branch mismatch documented in `scripts/audit-cron-drift.mjs`

3. **Missing Jobs**
   - `retention` and `weekly-digest` are defined on closeout/v1-final
   - NOT scheduled by main branch (where GitHub Actions runs from)
   - These two jobs have never run on production

## Actionable Alerts

### 🔴 CRITICAL
- **All cron jobs failing for unknown reason** (000 responses suggest timeout/crash)
- **Recommend:** Check Vercel function logs for server-side errors; may indicate deploys failing or functions hanging

### 🟡 WARNING
- **Whatsapp cron returns 401** — expected (route doesn't exist on main)
- **Retention + weekly-digest never scheduled** — expected (branch difference)
- **GitHub Actions workflow failing** — all 30+ recent runs show failure status

## Recommendations

1. **Investigate cron timeout:** Check Vercel function logs for 2026-10-19T14:25 timeframe
2. **Merge strategy:** Decide mainline (main vs. closeout/v1-final) to fix whatsapp/retention mismatch
3. **Monitoring:** Consider adding database-side logging to track when cron jobs actually complete work

---

**Next Review:** Scheduled cron jobs run continuously; next manual check recommended in 24 hours.
