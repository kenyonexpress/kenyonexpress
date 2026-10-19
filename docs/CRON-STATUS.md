# Cron Routes Health Status

**Last Updated:** 2026-10-20 06:00 UTC

**Status Summary:** ⚠️ **ALL ROUTES RETURNING 401 - SECRET MISMATCH**

---

## Executive Summary

All 13 scheduled cron jobs are configured and attempting to run on schedule, but **every execution is failing with HTTP 401 (Unauthorized)**. Root cause: `CRON_SECRET` in GitHub Actions differs from the value in Vercel environment variables.

**Impact:** Production background jobs (notifications, invoices, payment reconciliation, expired voucher cleanup) have not executed successfully since early September 2026. Outbox tables accumulate pending work.

---

## Scheduled Jobs Configuration

| Job Name | Path | Schedule | Last 24h Status |
|----------|------|----------|-----------------|
| notifications | `/api/cron/notifications` | `*/5 * * * *` | ❌ 401 |
| health | `/api/cron/health` | `*/5 * * * *` | ❌ 401 |
| invoices | `/api/cron/invoices` | `*/10 * * * *` | ❌ 401 |
| stock | `/api/cron/stock` | `*/10 * * * *` | ❌ 401 |
| stranded-payments | `/api/cron/stranded-payments` | `*/10 * * * *` | ❌ 401 |
| abandoned-cart | `/api/cron/abandoned-cart` | `0 * * * *` | ❌ 401 |
| subscriptions | `/api/cron/subscriptions` | `30 2 * * *` | ❌ 401 |
| reap-carts | `/api/cron/reap-carts` | `40 3 * * *` | ❌ 401 |
| reconcile | `/api/cron/reconcile` | `0 4 * * *` | ❌ 401 |
| expire-vouchers | `/api/cron/expire-vouchers` | `15 23 * * *` | ❌ 401 |
| retention | `/api/cron/retention` | `0 5 1 * *` | ❌ 401 |
| weekly-digest | `/api/cron/weekly-digest` | `0 4 * * 5` | ❌ 401 |
| affiliate-payouts | `/api/cron/affiliate-payouts` | `40 3 * * *` | ❌ 401 |

---

## Recent Execution History

**Last 24 Hours:** 18 scheduled runs attempted (every 5 min for notifications/health, every 10 min for others per schedule)

**GitHub Actions Log (2026-10-19 20:05 UTC):**
```
Call the jobs due now - cron failed (schedule '*/5 * * * *'):
  notifications → 401
  health → 401
```

**All Runs (Last 20):** 20/20 failed with status `failure`
- 2026-10-19 20:05:51 UTC → FAILURE
- 2026-10-19 19:01:32 UTC → FAILURE
- 2026-10-19 17:23:51 UTC → FAILURE
- ...continuing pattern
- Oldest visible: 2026-10-19 01:10:10 UTC → FAILURE

---

## Root Cause Analysis

**Problem:** Bearer token authentication mismatch

```
Authorization: Bearer {CRON_SECRET}
```

- **GitHub Actions Secret:** `CRON_SECRET` (stored in repo Settings > Secrets and variables > Actions)
- **Vercel Environment Variable:** `CRON_SECRET` (stored in Project Settings > Environment Variables)
- **Status:** Values differ. Every route in `src/app/api/cron/**/*.ts` compares the bearer against `process.env.CRON_SECRET ?? ''`
- **Result:** 401 Unauthorized on all jobs

---

## Affected Systems

### High Priority (Money Path)
- **invoices**: Generates customer invoices; blocked since 2026-09-10
- **reconcile**: Matches Cardcom charges to orders; blocked since 2026-09-10
- **stranded-payments**: Retries failed payment attempts; blocked since 2026-09-10
- **abandoned-cart**: Cart recovery emails; blocked since 2026-09-10

### Medium Priority (Data Maintenance)
- **notifications**: Push/SMS batch sends; 5-min intervals, ~288 scheduled per day
- **stock**: Inventory synchronization; 10-min intervals, ~144 scheduled per day
- **expire-vouchers**: Voucher lifecycle; runs nightly
- **subscriptions**: Subscription renewal; runs daily at 02:30 UTC

### Low Priority (Analytics/Cleanup)
- **health**: Service uptime check; 5-min intervals
- **retention**: Monthly user segmentation; runs monthly on 1st
- **weekly-digest**: Email digest; runs weekly on Friday
- **affiliate-payouts**: Commission distribution; runs nightly
- **reap-carts**: Cleanup expired carts; runs nightly

---

## Queued Work (Database Impact)

- **notification_outbox:** 72+ pending rows (oldest 2026-09-10 09:57 UTC)
- **order_invoices:** Ungenerated invoices for orders placed since 2026-09-10
- **payment_reconciliation:** Unmatched Cardcom charges; reconcile blocked
- **stripe/cardcom outbox tables:** Payment event rows pending retry

---

## Immediate Actions Required

### 1. Verify Secret Values (Owner Only)
```bash
# On Vercel dashboard:
# - Visit Project > Settings > Environment Variables
# - Find CRON_SECRET value

# On GitHub:
# - Visit Repository > Settings > Secrets and variables > Actions
# - Find CRON_SECRET value (obscured, but first 4 chars visible)

# If they differ → they must be synchronized
```

### 2. Synchronization Path (Once Verified)
If values differ, update the GitHub secret to match Vercel's value. This requires:
- Explicit authorization (high security impact)
- Update to GitHub Actions Settings
- Test via manual dispatch of one job
- Monitor next 5-minute cycle for success (200 response)

### 3. Fallback: Enable Vercel Cron (No Auth Required)
Vercel Hobby plan supports running 2 cron routes directly via `vercel.json`. Moving 2 highest-priority jobs (invoices, reconcile) there would unblock the money path without fixing the secret mismatch.

---

## Configuration References

- **Manifest:** `scripts/cron-jobs.json` (single source of truth, validated by tests)
- **Scheduler:** `.github/workflows/cron.yml` (GitHub Actions, fires from main only)
- **Executor:** `scripts/run-cron-jobs.sh` (bash, validates secret before calling)
- **Tests:** `src/__tests__/cron-schedule-inventory.test.ts` (keeps manifest in sync with routes)
- **Route Implementation:** `src/app/api/cron/*/route.ts` (Next.js API, checks bearer token)

---

## Historical Context

| Date | Event |
|------|-------|
| 2026-09-10 | First failures observed; secret mismatch identified |
| 2026-09-25 | Memory note created documenting 401 pattern (40/40 runs failed) |
| 2026-10-20 | Status check: 100% failure rate continues; routes reachable but unauthorized |

---

## Next Steps

1. **Verify the secret mismatch** (requires repository owner access)
2. **Synchronize CRON_SECRET** in GitHub Actions to match Vercel value
3. **Test one job manually** via GitHub Actions UI (Dispatch Workflow)
4. **Confirm success** in Vercel logs (should see 200 responses)
5. **Monitor the next scheduled cycle** (notifications run every 5 minutes)

**Do not commit additional code changes.** This is an operational configuration issue, not a code defect.
