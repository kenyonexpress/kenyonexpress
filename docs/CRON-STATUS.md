# Cron Routes Status

**Last check:** 2026-10-20 13:15 UTC (MAINTENANCE_LOOP_5)
**Status:** 🔴 CRITICAL. No cron route has completed successfully in production in the last 7 days. 0 requests with status 2xx.

## How this was measured

Vercel MCP is authenticated this session and `list_teams` / `list_projects` answer, but every read scoped to the project
(`get_runtime_logs`, `get_runtime_errors`, `list_deployments`, `get_project`) returns **403 forbidden** for
`team_TUMTPVDP8218QHwedSjmgJWl` / `prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`. The connector's grant does not cover the team.
Per the MCP's own recovery text, the mapped CLI fallback was used with the same team and project:

```
vercel --scope kenyonexpress-projects logs --project kenyonexpress --since 7d --json --query "/api/cron/<route>"
vercel --scope kenyonexpress-projects logs --project kenyonexpress --since 7d --json --status-code 401|404 --query "/api/cron"
vercel --scope kenyonexpress-projects crons ls --project kenyonexpress
vercel --scope kenyonexpress-projects api "/v13/deployments/<prod-url>"   (crons[], meta.githubCommitRef)
gh run list --workflow=cron.yml ; gh run view <id> --log
```

The CLI reads the same request-log store (`responseStatusCode`, `requestPath`, `timestamp`, `branch`, `deploymentId`).
Cap: 100 rows per query, so counts below are "at least".

## Production deployment facts

| Fact | Value |
|---|---|
| Live production deployment | `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA`, created 2026-10-19 04:43 UTC, source `cli` |
| Git ref it was built from | `audit/final-audit` @ `337d1a2a` |
| `crons` registered on that deployment | `[]` (empty) |
| `vercel.json` on `audit/final-audit` | **no `crons` key** (0 cron paths) |
| `vercel.json` on `autopilot` (this branch) | 5 cron paths |
| `vercel crons ls` | all 5 paths listed as **not deployed** |

Consequence: **Vercel's scheduler fires nothing.** The five schedules in this branch's `vercel.json` exist only on paper.

## Scheduled routes in `vercel.json` (this branch)

| Route | Schedule | Expected cadence | Hits in 7d (any status) | Last run | Stale > 24h |
|---|---|---|---|---|---|
| `/api/cron/observability-check` | `*/5 * * * *` | 2016 / week | **0** | never (7d window) | 🔴 YES |
| `/api/cron/fraud-monitor` | `*/10 * * * *` | 1008 / week | **0** | never (7d window) | 🔴 YES |
| `/api/cron/p95-monitor` | `*/15 * * * *` | 672 / week | **0** | never (7d window) | 🔴 YES |
| `/api/cron/deal-scraper` | `*/30 * * * *` | 336 / week | **0** | never (7d window) | 🔴 YES |
| `/api/cron/stock-notifications` | `0 * * * *` | 168 / week | **0** | never (7d window) | 🔴 YES |

All five: **STALE, 0 executions, never deployed.** Three of these (`observability-check`, `fraud-monitor`, `p95-monitor`) are
also absent from the deployed branch, so even a registered schedule would 404.

## The second scheduler: GitHub Actions `cron.yml` (fires from `main`)

`.github/workflows/cron.yml` on `main` runs `scripts/run-cron-jobs.sh` against `https://kenyonexpress.vercel.app`
(`CRON_BASE_URL` var is empty, so `defaultBaseUrl` is used). **Last 8 scheduled runs on 2026-10-20: 8 failures.**
Latest run `39425915503` (12:54 UTC):

```
schedule '*/5 * * * *' -> notifications health whatsapp notifications health
  notifications -> 000
  health -> 000
  whatsapp -> 401
  notifications -> 000
  health -> 000
```

Two distinct defects, both on `main`:

1. **`scripts/cron-jobs.json` on `main` (commit `d739d96b1`, 2026-10-19) holds 12 duplicated job names**
   (`notifications`, `health`, `invoices`, `stock`, `stranded-payments`, `abandoned-cart`, `subscriptions`, `reap-carts`,
   `reconcile`, `expire-vouchers`, `retention`, `weekly-digest`). `jq 'select(.name == $n) | .path'` then yields two
   paths joined by a newline, curl receives a malformed URL and answers `000` in ~10 ms without ever reaching Vercel.
   **These 12 jobs are not being called at all.** This branch's manifest has 13 jobs and no duplicates.
2. **Every job that does reach Vercel answers 401** (`whatsapp`, `webhook-dlq`, `wishlist-alerts`, and the full set when
   run manually at 09:25 UTC). The `CRON_SECRET` held by GitHub Actions does not match the production value.
   Known since 25.09, still open.
3. Jobs in `main`'s manifest that the deployed branch does not ship answer **404**: `affiliate-payouts`, `backup`,
   `cashback-settlement`, `daily-deals`, `email-retry`, `expire-cashback`, `expire-coupons`, `job-dlq`, `search-outbox`,
   `search-reindex`, `wishlist-digest`.

## All cron paths observed in production, last 7 days

Status breakdown over `/api/cron/*`: **2xx = 0**, 401 ≥ 50 (cap), 404 ≥ 50 (cap), 403 = 0, 5xx = 0.

| Route | Last hit (UTC) | Status | Hits seen | Exists on deployed branch |
|---|---|---|---|---|
| whatsapp | 2026-10-20 12:54:19 | 401 | 8 | yes |
| email-retry | 2026-10-20 11:56:52 | 404 | 6 | no |
| webhook-dlq | 2026-10-20 10:20:12 | 401 | 8 | yes |
| job-dlq | 2026-10-20 10:20:14 | 404 | 8 | no |
| search-outbox | 2026-10-20 10:20:14 | 404 | 9 | no |
| wishlist-alerts | 2026-10-20 09:39:21 | 401 | 4 | yes |
| affiliate-payouts | 2026-10-20 09:25:31 | 404 | 2 | no |
| retention | 2026-10-20 09:25:31 | 401 | 3 | yes |
| weekly-digest | 2026-10-20 09:25:31 | 401 | 3 | yes |
| abandoned-cart | 2026-10-20 09:25:30 | 401 | 3 | yes |
| expire-vouchers | 2026-10-20 09:25:30 | 401 | 2 | yes |
| reap-carts | 2026-10-20 09:25:30 | 401 | 2 | yes |
| reconcile | 2026-10-20 09:25:30 | 401 | 2 | yes |
| subscriptions | 2026-10-20 09:25:30 | 401 | 2 | yes |
| health | 2026-10-20 09:25:29 | 401 | 2 | yes |
| invoices | 2026-10-20 09:25:29 | 401 | 3 | yes |
| notifications | 2026-10-20 09:25:29 | 401 | 2 | yes |
| stock | 2026-10-20 09:25:29 | 401 | 3 | yes |
| stranded-payments | 2026-10-20 09:25:29 | 401 | 3 | yes |
| backup | 2026-10-20 09:25:28 | 404 | 4 | no |
| daily-deals | 2026-10-20 09:25:28 | 404 | 4 | no |
| expire-coupons | 2026-10-20 09:25:28 | 404 | 3 | no |
| search-reindex | 2026-10-20 09:25:28 | 404 | 8 | no |
| wishlist-digest | 2026-10-20 09:25:28 | 404 | 2 | no |
| expire-cashback | 2026-10-20 09:25:27 | 404 | 3 | no |
| cashback-settlement | 2026-10-19 09:54:26 | 404 | 1 | no |
| observability-check | none in 7d | - | 0 | no |
| fraud-monitor | none in 7d | - | 0 | no |
| p95-monitor | none in 7d | - | 0 | no |
| deal-scraper | none in 7d | - | 0 | no |
| stock-notifications | none in 7d | - | 0 | no |
| rfm-segmentation | none in 7d | - | 0 | no |
| search-report | none in 7d | - | 0 | no |
| sms-broadcasts | none in 7d | - | 0 | no |
| anonymize-user-data | none in 7d | - | 0 | yes |
| deals-autopilot | none in 7d | - | 0 | yes |
| payout-run | none in 7d | - | 0 | yes |
| price-schedule | none in 7d | - | 0 | yes |
| price-snapshot | none in 7d | - | 0 | yes |
| settlement-reconcile | none in 7d | - | 0 | yes |

The 09:25 UTC burst (every route, twice, within 7 seconds) matches a manual `all` run with the duplicated manifest, not the
scheduler. "Last hit" is the last **attempt**; the last **successful** run of any cron route is older than the 7-day
retention window and could not be dated.

## Alert

🔴 **Every cron route is stale by more than 24 hours.** Nothing scheduled has succeeded in production for at least 7 days.
Business impact: `notification_outbox` is not drained (no email/push leaves production), vouchers do not expire,
stranded payments are not swept, reconcile does not run, abandoned-cart nudges do not send.

## What fixes it (none applied here, all are production or secret changes)

1. **Deploy a build whose `vercel.json` carries a `crons` block**, or register the schedules externally. The deployed
   branch deliberately removed the block (Hobby plan registers two daily jobs and ignores the rest, see the header of
   `.github/workflows/cron.yml`). Decide one scheduler and make `vercel.json`, `scripts/cron-jobs.json` and the deployed
   branch agree.
2. **Set the same `CRON_SECRET` in GitHub Actions and Vercel production.** Ofir only; never read or print the values.
3. **Fix `scripts/cron-jobs.json` on `main`:** dedupe the 12 doubled names, and drop or ship the 11 routes that 404.
   `main` is protected (PR + 4 checks); this branch's manifest is clean and could be the source.
4. Set the repo variable `CRON_BASE_URL=https://kenyonexpress.co.il` once TLS on the apex is confirmed.

## History

- 2026-10-20 13:15 UTC: this check. MCP log reads 403, CLI fallback measured. 0×2xx in 7d.
- 2026-10-20 07:45 UTC: previous loop marked the 5 `vercel.json` routes STALE via CLI, 0 executions in 48h.
- 2026-10-20 ~20:50 (session clock): a loop recorded "BLOCKED, MCP needs OAuth". Superseded: MCP is authenticated,
  the block is a team-scope 403 on the connector grant, not OAuth.
- 2026-09-25: GitHub scheduler reaches a current deployment and every job answers 401 (secret mismatch), 40/40 runs failed.
