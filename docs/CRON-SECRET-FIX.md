# CRON_SECRET Fix (2026-10-24)

## Problem
Cron endpoints `/api/cron/health` and `/api/cron/notifications` were returning 401 Unauthorized.

## Root Cause
The `CRON_SECRET` environment variable in Vercel production did not match the value expected by the authentication logic in the route handlers.

## Solution
1. Updated `CRON_SECRET` in Vercel production environment to: `7enzQ1YmeKHs2uUHiqexSfAK9lBH6IEHlTecwBaugSQ=`
2. Updated local `.env.local` to match (not tracked in git)
3. Verified all cron routes use `bearerMatches()` with `Authorization: Bearer` header

## Verification
Local testing (after fix):
```bash
curl -H "Authorization: Bearer 7enzQ1YmeKHs2uUHiqexSfAK9lBH6IEHlTecwBaugSQ=" http://localhost:3311/api/cron/health
# Returns: {"ok":true,...} HTTP 200

curl -H "Authorization: Bearer 7enzQ1YmeKHs2uUHiqexSfAK9lBH6IEHlTecwBaugSQ=" http://localhost:3311/api/cron/notifications  
# Returns: {"ok":true,...} HTTP 200
```

Production testing requires a new deployment to pick up the updated env var.

## Files Modified
- `.env.local` (not tracked) - updated CRON_SECRET value
- Vercel environment variables - added/updated CRON_SECRET for all environments

## Cron Routes Verified
All 21 cron routes use the same `bearerMatches()` authentication pattern:
- /api/cron/health
- /api/cron/notifications (handles WhatsApp via `sendOutboxWhatsapp`)
- /api/cron/invoices
- /api/cron/stock
- /api/cron/stranded-payments
- /api/cron/abandoned-cart
- /api/cron/subscriptions
- /api/cron/reap-carts
- /api/cron/reconcile
- /api/cron/expire-vouchers
- /api/cron/retention
- /api/cron/weekly-digest
- /api/cron/affiliate-payouts
- /api/cron/observability-check
- /api/cron/fraud-monitor
- /api/cron/p95-monitor
- /api/cron/deal-scraper
- /api/cron/stock-notifications
- /api/cron/sms-broadcasts
- /api/cron/rfm-segmentation
- /api/cron/search-report
