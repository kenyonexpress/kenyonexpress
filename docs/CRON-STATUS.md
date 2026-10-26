# Cron Routes Status (2026-10-27)

## Runtime Logs Check via Vercel CLI

**Check Date:** 2026-10-27 17:24 UTC  
**Time Window:** Last 7 days (2026-10-20 → 2026-10-27)  
**Method:** Vercel CLI `logs` command with `/api/cron/` filter  
**Project:** kenyonexpress (prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP)  
**Environment:** Production  

## Status Summary

**Health Status:** ⚠️ **CRITICAL** — 17 of 22 routes (77%) STALE over 24h

| Status | Count | Routes |
|--------|-------|--------|
| ✅ Running (7d) | 5 | health, invoices, notifications, stock, stranded-payments |
| ⛔ Stale (>7d) | 17 | All others |
| **Total** | **22** | **From scripts/cron-jobs.json** |

## Healthy Routes (Ran in Last 7 Days)

1. ✅ `/api/cron/health` — runs every 5 minutes
2. ✅ `/api/cron/invoices` — runs every 10 minutes
3. ✅ `/api/cron/notifications` — runs every 5 minutes
4. ✅ `/api/cron/stock` — runs every 10 minutes
5. ✅ `/api/cron/stranded-payments` — runs every 10 minutes

## Stale Routes (No Runs in 7+ Days)

| Route | Schedule | Severity |
|-------|----------|----------|
| `/api/cron/abandoned-cart` | 0 * * * * | Revenue loss |
| `/api/cron/affiliate-payouts` | 40 3 * * * | Creator payments |
| `/api/cron/deal-scraper` | */30 * * * * | Content updates |
| `/api/cron/expire-vouchers` | 15 23 * * * | Data integrity |
| `/api/cron/fraud-monitor` | */10 * * * * | Security |
| `/api/cron/observability-check` | */5 * * * * | Monitoring |
| `/api/cron/p95-monitor` | */15 * * * * | Performance |
| `/api/cron/reap-carts` | 40 3 * * * | Cleanup |
| `/api/cron/reconcile` | 0 4 * * * | Finance |
| `/api/cron/retention` | 0 5 1 * * | Marketing |
| `/api/cron/rfm-segmentation` | 20 1 * * * | Analytics |
| `/api/cron/search-report` | 0 6 * * 1 | Analytics |
| `/api/cron/sms-broadcasts` | */10 * * * * | Communications |
| `/api/cron/stock-notifications` | 0 * * * * | Inventory |
| `/api/cron/subscriptions` | 30 2 * * * | Billing |
| `/api/cron/weekly-digest` | 0 4 * * 5 | Marketing |
| `/api/cron/cart-abandonment` | 0 * * * * | Revenue |

## Root Cause

**Branch Configuration Mismatch:**
- **Production deployed from:** `audit/final-audit` branch (via Vercel git auto-deploy)
- **That branch contains:** `scripts/cron-jobs.json` with `"jobs": []` (empty array)
- **Expected deployment:** `origin/main` or `closeout/v1-final` with full 22 cron jobs
- **Why:** Vercel auto-deploy reads `cron` from active branch's next.config; empty jobs = no schedules

## Impact Assessment

**Affected Business Functions (STALE):**
- ⛔ Abandoned cart recovery (revenue stream)
- ⛔ Affiliate commissions (creator payments overdue)
- ⛔ Deal scraper (catalog stale)
- ⛔ Fraud detection (security gap)
- ⛔ Inventory alerts (stock-outs not reported)
- ⛔ Weekly marketing digest (user engagement)
- ⛔ Voucher expiry (accounting issues)

**Working Functions (HEALTHY):**
- ✅ Health checks every 5 minutes
- ✅ Invoice generation every 10 minutes
- ✅ Notification delivery every 5 minutes
- ✅ Stock level updates every 10 minutes
- ✅ Stranded payment recovery every 10 minutes

## Resolution Required

**Action:** Update production deployment branch to use `main` or `closeout/v1-final`

**Steps:**
1. Update Vercel project git settings to deploy from correct branch
2. Or: Merge autopilot → closeout/v1-final → main, update Vercel
3. Verify via `vercel logs --project kenyonexpress --since 1h` shows all routes running

**Blocker:** Requires manual Vercel dashboard access or `vercel` CLI with team permissions

---
