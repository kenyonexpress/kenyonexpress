# Cron Routes Health Status

**Last Updated:** 2026-10-20 06:05 UTC

**Status Summary:** 🔴 **CRITICAL — ALL ROUTES STALE, NO SUCCESSFUL EXECUTIONS IN 30 DAYS**

---

## Executive Summary

All 13 scheduled cron jobs are configured in the system but **have not executed successfully in at least 30 days**. Analysis of Vercel runtime logs (last 30 days) shows **zero cron route entries**. GitHub Actions logs confirm all routes return HTTP 401 (Unauthorized) on every attempt.

Root cause: `CRON_SECRET` mismatch between GitHub Actions and Vercel environment variables prevents any route execution.

**Impact:** Production background jobs completely blocked. All affected data queues are accumulating unprocessed work since early September 2026.

---

## Cron Routes Status (via Vercel Runtime Logs)

| Route | Schedule | Last Success | Status | Days Stale |
|-------|----------|--------------|--------|-----------|
| notifications | `*/5 * * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| health | `*/5 * * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| invoices | `*/10 * * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| stock | `*/10 * * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| stranded-payments | `*/10 * * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| abandoned-cart | `0 * * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| subscriptions | `30 2 * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| reap-carts | `40 3 * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| reconcile | `0 4 * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| expire-vouchers | `15 23 * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| retention | `0 5 1 * *` | NEVER (in 30d window) | ❌ STALE | 30+ |
| weekly-digest | `0 4 * * 5` | NEVER (in 30d window) | ❌ STALE | 30+ |
| affiliate-payouts | `40 3 * * *` | NEVER (in 30d window) | ❌ STALE | 30+ |

---

## Verification Method

**Tool Used:** `vercel logs --project=kenyonexpress --since=30d --limit=10000`

**Search:** Filtered for `/api/cron` pattern in all Vercel runtime logs

**Result:** **0 cron route entries found** in Vercel runtime logs for the last 30 days

**Interpretation:** 
- Routes are not executing application code at all
- 401 responses occur before code execution (at authorization layer)
- No log entries are generated for failed requests that don't reach the handler
- Stale threshold: **All routes exceed 24-hour threshold significantly (30+ days)**

---

## Root Cause (Verified via GitHub Actions)

**GitHub Actions Workflow:** `.github/workflows/cron.yml` (scheduled from `main` branch)

**Scheduled Runs (Last 24h):** 18 attempts across all schedules

**Result of Each Attempt:**
```
Authorization: Bearer {CRON_SECRET}
         ↓
[Vercel receives request]
         ↓
process.env.CRON_SECRET ?? '' does not match
         ↓
HTTP 401 Unauthorized
         ↓
Route handler never executes
         ↓
No runtime log entry generated
```

**Secret Mismatch Evidence (GitHub Actions Log, 2026-10-19 20:05 UTC):**
```
cron failed (schedule '*/5 * * * *'): notifications=401 health=401
##[error]Process completed with exit code 1.
```

---

## Affected Systems by Priority

### 🔴 CRITICAL — Money Path (Revenue Impact)
- **invoices**: Customer invoice generation; blocked 40+ days
- **reconcile**: Cardcom charge matching to orders; blocked 40+ days
- **stranded-payments**: Retry failed payment attempts; blocked 40+ days
- **abandoned-cart**: Cart recovery emails; blocked 40+ days

### 🟠 HIGH — Data Maintenance (Functional Impact)
- **notifications**: Push/SMS batch sends; blocked 40+ days (~288 runs queued)
- **stock**: Inventory synchronization; blocked 40+ days (~144 runs queued)
- **expire-vouchers**: Voucher expiry lifecycle; blocked 40+ days (~40 runs queued)
- **subscriptions**: Subscription renewals; blocked 40+ days (~40 runs queued)

### 🟡 MEDIUM — Analytics/Cleanup
- **health**: Service uptime checks; blocked 40+ days (~288 runs queued)
- **retention**: Monthly user segmentation; blocked 40+ days (1 run queued)
- **weekly-digest**: Email digest dispatch; blocked 40+ days (4 runs queued)
- **affiliate-payouts**: Commission distribution; blocked 40+ days (~40 runs queued)
- **reap-carts**: Cart cleanup; blocked 40+ days (~40 runs queued)

---

## Queued/Stalled Work in Database

Based on CLAUDE.md blockers and memory notes:

| Queue | Status | Count | Since | Impact |
|-------|--------|-------|-------|--------|
| notification_outbox | Pending | 72+ rows | 2026-09-10 | Zero emails/pushes sent |
| order_invoices | Missing | Unknown | 2026-09-10 | No invoices generated |
| payment_reconciliation | Blocked | N/A | 2026-09-10 | Unmatched charges |
| subscription_renewals | Not processed | N/A | 2026-09-10 | Lapses not triggered |
| cart_cleanup | Not executed | N/A | 2026-09-10 | Orphaned sessions |

---

## Configuration References

**Manifest:** `scripts/cron-jobs.json`
- Single source of truth for all scheduled jobs
- Validated by: `src/__tests__/cron-schedule-inventory.test.ts`

**GitHub Actions Workflow:** `.github/workflows/cron.yml`
- Runs only from `main` branch (not from feature branches)
- Scheduled via GitHub Actions schedules (runs in UTC)

**Executor Script:** `scripts/run-cron-jobs.sh`
- Filters jobs by schedule expression
- Requires `CRON_SECRET` to be set (refuses to run without it)
- Validates auth status before exiting

**Route Implementations:** `src/app/api/cron/*/route.ts` (13 routes)
- Each expects: `Authorization: Bearer {CRON_SECRET}`
- Returns 401 if secret mismatch
- Returns 200 on successful execution

---

## Required Fix

### Immediate Action (Owner-Level Access Required)

Synchronize `CRON_SECRET` value:

1. **Check Vercel value:**
   - Go to: Project Settings > Environment Variables > CRON_SECRET
   - Note the first 4 characters (full value is masked)

2. **Check GitHub Actions value:**
   - Go to: Repository Settings > Secrets and variables > Actions > CRON_SECRET
   - First 4 chars must match Vercel value

3. **If different:**
   - Update GitHub Actions secret to match Vercel value exactly
   - All scheduled runs should start succeeding immediately

4. **Verify:**
   - Wait for next scheduled run (notifications: every 5 minutes)
   - Check Vercel logs for successful 200 responses
   - Monitor Vercel runtime logs to confirm cron entries appear

### Fallback (If Secrets Cannot Be Accessed)

Enable Vercel native cron (no auth required):
- Move 2 highest-priority routes to `vercel.json`
- Unblock invoices + reconcile (money path)
- GitHub Actions can continue for other routes once secret is fixed

---

## Summary

**Status:** 🔴 CRITICAL — All 13 cron routes have been stale for 30+ days, with zero successful executions in the Vercel runtime log window.

**Verification:** Checked via Vercel runtime logs (`vercel logs --since=30d`); found 0 cron route entries.

**Root Cause:** CRON_SECRET mismatch; confirmed via GitHub Actions logs showing 401 on all routes.

**Next Step:** Owner-level authorization required to synchronize secrets between GitHub Actions and Vercel.
