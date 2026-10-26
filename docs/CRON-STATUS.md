# Cron Routes Status

## MAINTENANCE_LOOP_5 Results (2026-10-26 09:25 UTC)

**Last check:** 2026-10-26T09:25:00Z (MAINTENANCE_LOOP_5 re-check via Vercel CLI)  
**Status:** ⚠️ ALERT — 1 healthy route, 20 missing from 7d logs (likely stale)

### Latest Check Summary (2026-10-26 09:25 UTC)

| Category | Count | Status |
|---|---|---|
| Total cron routes defined | 23 | - |
| Executing cron routes (within 24h) | 1 | ⚠️ affiliate-payouts only |
| Stale routes (>24h) | 0 | ✅ None confirmed |
| Missing from logs (7d window) | 22 | ⚠️ ALERT |

### ✅ Active Routes (< 24h)

Single route with recent activity:

- `/api/cron/affiliate-payouts` — 2026-10-26T09:21:29Z (4 min ago)

### ⚠️ Missing from Logs (7d window)

The following 22 cron routes have NO execution logs in the past 7 days:

- `/api/cron/abandoned-cart`
- `/api/cron/cart-abandonment`
- `/api/cron/deal-scraper`
- `/api/cron/expire-vouchers`
- `/api/cron/fraud-monitor`
- `/api/cron/health`
- `/api/cron/invoices`
- `/api/cron/notifications`
- `/api/cron/observability-check`
- `/api/cron/p95-monitor`
- `/api/cron/reap-carts`
- `/api/cron/reconcile`
- `/api/cron/retention`
- `/api/cron/rfm-segmentation`
- `/api/cron/search-report`
- `/api/cron/sms-broadcasts`
- `/api/cron/stock`
- `/api/cron/stock-notifications`
- `/api/cron/stranded-payments`
- `/api/cron/subscriptions`
- `/api/cron/weekly-digest`

**Assessment:** Cron scheduler appears to be non-functional. Of 23 defined cron routes, only 1 shows recent execution. Most routes missing from logs entirely. This is a regression from prior measurements that showed 8 healthy routes. **Requires immediate investigation.**

**Method:** Vercel CLI `vercel logs --project kenyonexpress --since 7d` parsed for `/api/cron` route patterns and timestamps. Each route matched against defined routes in `src/app/api/cron/*/route.ts`.

---

## Previous Status

Earlier measurements from 2026-10-25 and prior show extensive cron scheduling issues. See full history below if needed.
