# Scheduler jobs

Source of truth: `scripts/cron-jobs.json` (twelve). GitHub Actions `.github/workflows/cron.yml` when `CRON_SCHEDULER_ENABLED` + `CRON_SECRET`. `vercel.json` has **no** `crons` (Hobby would run two silently). 162 pg_cron blocked on vault.

Auth: `Authorization: Bearer CRON_SECRET`. Missing → 401 (safe).

| name | path | cron (JSON) | Does | Failure |
|---|---|---|---|---|
| notifications | `/api/cron/notifications` | `*/5 * * * *` | Drain outbox; **only voucher email sender** | Mail delay; pay still paid |
| health | `/api/cron/health` | `*/5 * * * *` | Seven dependency checks; pages | Dark ops |
| invoices | `/api/cron/invoices` | `*/10 * * * *` | Issue documents | VAT docs late |
| stock | `/api/cron/stock` | `*/10 * * * *` | Release expired reservations | Stock stuck held |
| stranded-payments | `/api/cron/stranded-payments` | `*/10 * * * *` | Retry finalize, not POST body | Charged-not-paid persists |
| abandoned-cart | `/api/cron/abandoned-cart` | `0 * * * *` | Marketing nudge | Missed mail |
| subscriptions | `/api/cron/subscriptions` | `30 2 * * *` | Token renewals | Missed period_key charge |
| reap-carts | `/api/cron/reap-carts` | `40 3 * * *` | `fn_reap_expired_carts` | Cart table growth |
| reconcile | `/api/cron/reconcile` | `0 4 * * *` | Terminal vs rows | Silent drift |
| expire-vouchers | `/api/cron/expire-vouchers` | `15 23 * * *` | issued→expired; not Cardcom | Over-valid codes |
| retention | `/api/cron/retention` | `0 5 1 * *` | 157 or `pending` green | IPs remain |
| weekly-digest | `/api/cron/weekly-digest` | `0 4 * * 5` | Operator mail | Missed digest |

Double scheduler: unique keys / locks must hold; still duplicate **mail**. Do not enable 162 while Actions is live.

---

## Open questions

| Q | Best answer |
|---|---|
| Older docs say ten jobs? | **Twelve.** JSON is the contract. |

---

## Second pass (Hobby silence)

- Source:
  `scripts/cron-jobs.json`
  plus Actions
  `.github/workflows/cron.yml`.
- `vercel.json` has no `crons`. Hobby would run two jobs and ignore the rest with no error.
- Notifications cron is the **only** voucher email sender. Finalize does not mail.
- Expire cron does not call Cardcom. Stranded cron retries finalize from GetLpResult.
- Do not enable 162 while Actions is live (duplicate mail).

