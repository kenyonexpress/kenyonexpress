# Cron Routes Status

**Last check:** 2026-10-21 11:10 UTC (MAINTENANCE_LOOP_5, ninth run; MCP `get_runtime_logs` called in-session twice, 403 both times; CLI fallback measured over 24h and 7d, no transient errors this run)
**Status:** 🔴 CRITICAL, unchanged since 2026-10-20 13:15 UTC (ninth consecutive measurement). All 5 `vercel.json` routes are stale over 24h with 0 hits in 7 days. The only 2xx in 7 days is `/api/cron/health`, twice, at 2026-10-19 04:55 UTC (a manual probe after the deploy), which is itself 54h stale. Every other hit is 401 or 404. The only live scheduler is pg_cron inside the database (01:30 UTC today, 48 of 48 succeeded).

## How this was measured

Vercel MCP: at 13:15 UTC the connector was authenticated but every project-scoped read (`get_runtime_logs`,
`get_runtime_errors`, `list_deployments`, `get_project`) returned **403 forbidden** for
`team_TUMTPVDP8218QHwedSjmgJWl` / `prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`; the connector's grant does not cover the team.
At 17:10 UTC the server reported connected but exposed **no callable tools** to this session: `claude mcp list` reads
`claude.ai Vercel: https://mcp.vercel.com - ! Connected · tools fetch failed — Request timed out`, twice, 20 s apart,
and six tool searches for `get_runtime_logs` plus a resource listing returned nothing. The timeout is between the
harness and mcp.vercel.com. A minute-by-minute poll saw the connector recover at 17:45:02 UTC, and at 17:46 UTC a
fresh read-only session (tools restricted to `get_runtime_logs` and `list_projects`, no shell, no file writes, run
from `/tmp`) called **`get_runtime_logs` for real, twice**: once with `environment=production`, `query=/api/cron`,
`since=7d`, `limit=100` (window 2026-10-13T17:46:21Z to 2026-10-20T17:46:21Z) and once with only `teamId` and
`projectId`. Both answered at page 0 with `Vercel API request failed (403: forbidden). Forbidden`, 0 rows, the
same grant failure as at 13:15 UTC. So the MCP read was executed and is **403, not timed out**. A second probe at 17:52 UTC enumerated the
grant: `list_teams` returns exactly one team, `kenyonexpress-projects` (`team_TUMTPVDP8218QHwedSjmgJWl`), and
`list_projects` returns exactly two projects, `kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) and
`kenyonexpress-staging` (`prj_7Ar3dFtaIqemo7bc1Fg7SMh11joY`). `get_runtime_logs` answered
`Vercel API request failed (403: forbidden)` at page 0 for **both**, filtered and bare. There is no other team or
project to try. The connector can list but cannot read logs; the fix is the connector's scope in claude.ai
settings, which only Ofir can change. No last-run timestamp can come from MCP under the current grant. Per the MCP's own recovery text, the mapped CLI fallback was used both times with
the same team and project:

```
vercel --scope kenyonexpress-projects logs --project kenyonexpress --since 7d --json --query "/api/cron/<route>"
vercel --scope kenyonexpress-projects logs --project kenyonexpress --since 7d --json --status-code 401|404 --query "/api/cron"
vercel --scope kenyonexpress-projects crons ls --project kenyonexpress
vercel --scope kenyonexpress-projects api "/v13/deployments/<prod-url>"   (crons[], meta.githubCommitRef)
gh run list --workflow=cron.yml ; gh run view <id> --log
```

The CLI reads the same request-log store (`responseStatusCode`, `requestPath`, `timestamp`, `branch`, `deploymentId`).
Cap: 100 rows per query, so counts below are "at least".

## Re-measurement at 23:27 UTC (fifth run)

MCP `get_runtime_logs` was called twice from this session against `team_TUMTPVDP8218QHwedSjmgJWl` /
`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`: once filtered (`environment=production`, `query=/api/cron`, `since=7d`,
`limit=100`, window 2026-10-13T23:27:38Z to 2026-10-20T23:27:38Z) and once as `group_by=requestPath`, `since=24h`.
Both answered `Vercel API request failed (403: forbidden)` at page 0. Same grant failure as every earlier run; the
CLI fallback was used with the same team and project.

| Probe (24h window, 22:27 UTC 19.10 to 23:27 UTC 20.10) | Result |
|---|---|
| `vercel logs --status-code 200 --query "/api/cron"` | **0 rows** |
| `vercel logs --query "/api/cron"` (any status) | at least 50 rows, every one 401 or 404 |
| Latest attempt of any cron route | 2026-10-20 22:33:12 UTC: `webhook-dlq` 401, `job-dlq` 404, `search-outbox` 404 |
| `vercel crons ls --project kenyonexpress` | all 5 paths still **not deployed** |
| Production deployments (`vercel ls --prod`) | two, both 2 days old, no new deploy since the last check |
| `gh run list --workflow=cron.yml` (last 6, all on `main`) | 6 of 6 **failure**, latest `39508937508` at 22:33 UTC |

Latest scheduler run `39508937508` reproduces the same three defects: `invoices`, `stock`, `stranded-payments`
answer `000` twice each (duplicate manifest names), `webhook-dlq` answers 401 (secret mismatch), `job-dlq` and
`search-outbox` answer 404 (not on the deployed branch). Nothing changed between the 22:18 and 23:27 measurements,
and no action in this loop can change it: the three owners are unchanged (deploy choice, Ofir's secret, a dedupe PR
to protected `main`).

## True last-run evidence from production itself (23:52 UTC)

The request logs only hold 7 days and show attempts, not outcomes. Production's own tables hold the outcome of every
cron route that writes something, with no retention cap. Read via the Supabase management API (read-only, one
`UNION ALL` statement, no rows written):

| Route | Side effect dated | Latest value | Backlog waiting for the route |
|---|---|---|---|
| `notifications` | `notification_outbox.sent_at` / `push_sent_at` | **never** (both NULL on every row) | **232** rows never sent |
| `health` (search floor) | `search_index_outbox.done_at` | **never** | **163** rows never drained |
| `search-outbox` | `search_index_outbox.done_at` | **never** | same 163 |
| `whatsapp` | `whatsapp_outbox.sent_at` | never (table empty of sent rows) | 0 |
| `abandoned-cart` | `abandoned_cart_nudges.sent_at` | never | 0 |
| `stock` | `stock_waitlist.notified_at` | never | 0 |
| `stock` / `reap-carts` | `stock_reservations.released_at` | 2026-09-21 22:45:56 UTC | **10** expired reservations never released |
| `reap-carts` | expired `carts` still present | oldest expiry 2026-10-05 22:26 UTC | **1,029** expired carts not reaped |
| `expire-vouchers` | `vouchers.updated_at` | 2026-10-15 03:00:09 UTC | 0 past-expiry open vouchers |
| `invoices` | `invoices.issued_at` | 2026-10-15 03:04:39 UTC | 0 unissued |
| `subscriptions` | `subscriptions.last_charge_at` | never | 0 due |
| `retention` (report refresh) | `report_cohort_retention.refreshed_at` | 2026-10-20 01:30:00 UTC | n/a |

So the **true last successful run** of the routes that leave a trace is: never for `notifications`, `search-outbox`,
`whatsapp`, `abandoned-cart`, `stock` waitlist and `subscriptions`; before 2026-09-21 for reservation release; before
2026-10-05 for `reap-carts`. The 15.10 03:00 voucher and invoice timestamps are the newest writes to those tables
and are not attributed to a route here. No table in production is named like a cron ledger (`information_schema`
scan for cron, job, run, heartbeat, scheduler: 0 tables), so there is no per-route run log to read.

### The one scheduler that is alive: pg_cron inside the database

`cron.job` holds exactly one job and `cron.job_run_details` is its ledger:

| Job | Schedule | Active | Runs | Last run (UTC) | Status |
|---|---|---|---|---|---|
| `report_tables_nightly` (`select public.refresh_report_tables()`) | `30 1 * * *` | yes | 47 succeeded, 0 failed, since 2026-09-04 | **2026-10-20 01:30:00** | 🟢 fresh (under 24h) |

That is why `report_cohort_retention.refreshed_at` reads 01:30 today: the database refreshes the report tables on its
own, independent of Vercel and of GitHub Actions. It is the only scheduled work on this system with a success in the
last 24 hours.

### Vercel observability via MCP

`get_observability_schema` and `create_observability_query` (metric `vercel_requests`, grouped by path and status,
7 days) both answer `404: not_found. Observability Data not found` for the team. Not a grant failure like the log
reads; the observability data product is not present for this team, so there is no MCP-side path to a per-route
count either.

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
| whatsapp | 2026-10-20 20:55:13 | 401 | 13 | yes |
| email-retry | 2026-10-20 21:47:22 | 404 | 10 | no |
| webhook-dlq | 2026-10-20 22:33:12 | 401 | 13 | yes |
| job-dlq | 2026-10-20 22:33:12 | 404 | 12 | no |
| search-outbox | 2026-10-20 22:33:12 | 404 | 13 | no |
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
| search-reindex | 2026-10-20 22:07:17 | 404 | 11 | no |
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

## 17:10 UTC re-measurement (same day)

Same CLI queries, `--since 48h` (50-row cap reached, window actually covers 09:08 to 15:18 UTC) plus `--since 3h`:

| Metric | Value |
|---|---|
| Production deployment | still `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` (`audit/final-audit` @ `337d1a2a`), `crons: []` |
| `vercel crons ls` | 5 paths, all **not deployed** |
| `/api/cron/*` hits, 7d, status 2xx | **0** |
| `/api/cron/*` hits, 7d, status 5xx | **0** |
| Last 50 hits (09:08 to 15:18 UTC) | 401 = 33, 404 = 17 |
| Newest hit of any cron route | `search-outbox` 404 at 15:18:18 UTC, from the GitHub scheduler |
| GitHub `cron.yml`, last 12 scheduled runs (07:43 to 15:18 UTC) | **12 / 12 failed** |

Latest run `39447136094` (15:18 UTC, schedule `*/10`): `invoices`, `stock`, `stranded-payments` answered `000` twice each
(duplicated-manifest curl defect, never reached Vercel), `webhook-dlq` 401, `job-dlq` 404, `search-outbox` 404.

The five `vercel.json` routes (`observability-check`, `fraud-monitor`, `p95-monitor`, `deal-scraper`,
`stock-notifications`) still have **0 hits** and remain 🔴 stale. Nothing changed between the two checks except the
clock; no fix listed above has been applied.

## 19:56 UTC re-measurement (same day, third run)

Vercel MCP: `claude mcp list` again reads `claude.ai Vercel: https://mcp.vercel.com - ! Connected · tools fetch failed
— Request timed out`. Four tool searches (`get_runtime_logs`, `list_projects`, `list_deployments`, keyword `runtime
logs`) returned nothing, so no MCP read was possible from this session. CLI fallback with the same scope and project.

| Metric | Value |
|---|---|
| Production deployment | still `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` (`audit/final-audit` @ `337d1a2a`, source `cli`, 2026-10-19 04:43 UTC), `crons: []` |
| `vercel crons ls` | 5 paths, all **not deployed**, "5 local changes pending deploy" |
| `/api/cron/*` hits, 7d, status 200/201/204 | **0 / 0 / 0** |
| `/api/cron/*` hits, 7d, status 500/502/503/504 | **0 / 0 / 0 / 0** |
| Last 50 hits (09:25 to 19:24 UTC) | 401 = 30, 404 = 20 |
| Newest hit of any cron route | `search-outbox` 404 and `job-dlq` 404 at 19:24:12 UTC, `webhook-dlq` 401 at 19:24:09 UTC, from the GitHub scheduler |
| GitHub `cron.yml`, last 12 scheduled runs (09:07 to 19:24 UTC) | **12 / 12 failed** |

Latest run `39483127046` (19:24 UTC, schedule `*/10`): `invoices`, `stock`, `stranded-payments` answered `000` twice
each (duplicated manifest on `main`, curl never reached Vercel), `webhook-dlq` 401, `job-dlq` 404, `search-outbox` 404.
Identical failure shape to the 15:18 UTC run.

Per route, last attempt in the 7-day window (all 401 or 404, none 2xx):

| Route | Last attempt (UTC) | Status | Hits |
|---|---|---|---|
| job-dlq | 2026-10-20 19:24:12 | 404 | 4 |
| search-outbox | 2026-10-20 19:24:12 | 404 | 4 |
| webhook-dlq | 2026-10-20 19:24:09 | 401 | 6 |
| whatsapp | 2026-10-20 17:47:25 | 401 | 3 |
| email-retry | 2026-10-20 17:26:44 | 404 | 3 |
| search-reindex | 2026-10-20 18:54:52 | 404 | 3 |
| wishlist-alerts | 2026-10-20 09:39:21 | 401 | 2 |
| all other manifest routes | 2026-10-20 09:25 burst | 401 or 404 | 1 to 2 |

The five `vercel.json` routes (`observability-check`, `fraud-monitor`, `p95-monitor`, `deal-scraper`,
`stock-notifications`) still have **0 hits in 7 days** and remain 🔴 stale over 24h. No fix from the list above has
been applied since the 13:15 UTC check; only the clock moved.

## 22:18 UTC re-measurement (same day, fourth run)

Vercel MCP: the connector exposed its tools to this session on the first fetch, and three reads were made for real
against `team_TUMTPVDP8218QHwedSjmgJWl` / `prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`:

| Call | Filters | Answer |
|---|---|---|
| `get_runtime_logs` | `environment=production`, `query=/api/cron`, `since=7d`, `limit=100` (window 2026-10-13T22:18:25Z to 2026-10-20T22:18:25Z) | `Runtime log query failed at page 0: Vercel API request failed (403: forbidden)`, 0 rows |
| `get_runtime_logs` | same, `group_by=requestPath` | `403: forbidden`, request `9p6lr-1792534705508` |
| `get_runtime_errors` | `since=7d` | `403: forbidden. The specified project does not exist or you do not have access`, request `g7d7p-1792534706161` |

Same grant failure as 17:46, 17:52 and 20:41 UTC; the connector lists the project but cannot read its logs. The
tool's own recovery text names the CLI mapping, used below with the same scope and project.

| Metric | Value |
|---|---|
| Production deployment | still `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` (`audit/final-audit` @ `337d1a2a`, source `cli`, 2026-10-19 04:43 UTC), `crons: []` |
| `vercel crons ls` | 5 paths, all **not deployed**, "5 local changes pending deploy" |
| `/api/cron/*` hits, 7d and 24h, status 2xx | **0** |
| `/api/cron/*` hits, 7d and 24h, status 5xx | **0** |
| Last 50 hits (09:25 to 22:07 UTC; the CLI returns 50 rows even with `--limit 100`) | 401 = 30, 404 = 20 |
| Newest hit of any cron route | `search-reindex` 404 at 22:07:17 UTC, from the GitHub scheduler |
| GitHub `cron.yml`, last 12 scheduled runs (10:20 to 22:07 UTC) | **12 / 12 failed** |

Latest run `39505709803` (22:07 UTC, schedule `0 * * * *`): `abandoned-cart` answered `000` twice (duplicated manifest
on `main`, curl never reached Vercel), `search-reindex` 404. Run `39503160389` (21:47 UTC, schedule `30 */6 * * *`):
`email-retry` 404. Same failure shape as every run today.

Per route, last attempt in the window (all 401 or 404, none 2xx):

| Route | Last attempt (UTC) | Status | Hits |
|---|---|---|---|
| search-reindex | 2026-10-20 22:07:17 | 404 | 4 |
| email-retry | 2026-10-20 21:47:22 | 404 | 4 |
| whatsapp | 2026-10-20 20:55:13 | 401 | 4 |
| job-dlq | 2026-10-20 19:24:12 | 404 | 3 |
| search-outbox | 2026-10-20 19:24:12 | 404 | 4 |
| webhook-dlq | 2026-10-20 19:24:09 | 401 | 5 |
| wishlist-alerts | 2026-10-20 09:39:21 | 401 | 2 |
| all other manifest routes | 2026-10-20 09:25 burst | 401 or 404 | 1 to 2 |

The five `vercel.json` routes (`observability-check`, `fraud-monitor`, `p95-monitor`, `deal-scraper`,
`stock-notifications`) still have **0 hits in 7 days** and remain 🔴 stale over 24h. No fix from the list above has
been applied since the 13:15 UTC check.

## 01:06 UTC re-measurement, 21.10 (sixth run)

MCP `get_runtime_logs` was called twice from this session against `team_TUMTPVDP8218QHwedSjmgJWl` /
`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`: filtered (`environment=production`, `query=/api/cron`, `since=7d`, `limit=100`,
window 2026-10-14T01:06:16Z to 2026-10-21T01:06:16Z) and `group_by=requestPath` over `24h`. Both answered
`Vercel API request failed (403: forbidden)` at page 0, request `5rmzg-1792544777546`, 0 rows. Same grant failure as
every run since 13:15 UTC on 20.10; the tool's own recovery text maps to the CLI used below with the same scope.

| Probe | Result |
|---|---|
| `vercel logs --since 7d --status-code 200 --query "/api/cron"` | **2 rows**, both `/api/cron/health` on `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` at 2026-10-19 04:55:07 and 04:55:21 UTC (`queue.depth search_outbox pending=16`) |
| `vercel logs --since 7d --status-code 5xx --query "/api/cron"` | **0 rows** |
| `vercel logs --since 24h --query "/api/cron"` (any status, cap 50) | 50 rows, 09:25:28 UTC 20.10 to 00:56:07 UTC 21.10: 401 = 27, 404 = 23 |
| Newest hit of any cron route | `search-outbox` and `job-dlq` 404, `webhook-dlq` 401, at 00:56 UTC from the GitHub scheduler |
| `vercel crons ls --project kenyonexpress` | 5 paths, all **not deployed**, "5 local changes pending deploy" |
| Production alias `kenyonexpress.co.il` | still `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` (`audit/final-audit` @ `337d1a2a`, source `cli`, 2026-10-19 04:43 UTC), `crons: []` |
| GitHub `cron.yml`, last 8 scheduled runs (18:54 UTC 20.10 to 00:55 UTC 21.10, all on `main`) | **8 / 8 failed** |

Latest run `39524285650` (00:56 UTC, schedule `*/10 * * * *`): `invoices`, `stock`, `stranded-payments` answered `000`
twice each (duplicate manifest names on `main`, curl never reached Vercel), `webhook-dlq` 401, `job-dlq` and
`search-outbox` 404. Identical failure shape to every run since 25.09.

MCP was called a third and fourth time at 01:11 UTC (`get_runtime_logs` with `source=function`, `since=24h`,
`query=/api/cron/`; and `get_runtime_errors` with `routes=` the five `vercel.json` paths, `since=7d`): both
`403: forbidden`, request `fq8rw-1792545105021`, 0 rows. Four MCP reads this run, four 403s.

**Every route, individually, last attempt and last success over 7 days** (one `vercel logs --since 7d --limit 100
--json --query "/api/cron/<route>"` per route, 32 routes = the union of `src/app/api/cron/` (21 directories),
`vercel.json` (5), this branch's `scripts/cron-jobs.json` manifest (13) and every `/api/cron/*` path seen in the
request log; "main scheduler" marks paths that only `main`'s `cron.yml` manifest calls and this branch does not
ship). Hits are capped at 100 per query, so counts of 50 are "at least". Window 2026-10-14 01:17 to 2026-10-21 01:19 UTC.

| Route | Defined in | Last attempt (UTC) | Status | Hits 7d | Last 2xx (UTC) | Over 24h |
|---|---|---|---|---|---|---|
| search-reindex | main scheduler | 2026-10-21 01:17:55 | 404 | 48 | never in 7d | 🔴 stale |
| search-outbox | main scheduler | 2026-10-21 00:56:07 | 404 | 50 | never in 7d | 🔴 stale |
| job-dlq | main scheduler | 2026-10-21 00:56:07 | 404 | 50 | never in 7d | 🔴 stale |
| webhook-dlq | main scheduler | 2026-10-21 00:56:05 | 401 | 50 | never in 7d | 🔴 stale |
| whatsapp | main scheduler | 2026-10-20 23:40:12 | 401 | 50 | never in 7d | 🔴 stale |
| email-retry | main scheduler | 2026-10-20 21:47:22 | 404 | 34 | never in 7d | 🔴 stale |
| wishlist-alerts | main scheduler | 2026-10-20 09:39:21 | 401 | 14 | never in 7d | 🔴 stale |
| affiliate-payouts | manifest, src | 2026-10-20 09:25:31 | 404 | 2 | never in 7d | 🔴 stale |
| weekly-digest | manifest, src | 2026-10-20 09:25:31 | 401 | 9 | never in 7d | 🔴 stale |
| retention | manifest, src | 2026-10-20 09:25:31 | 401 | 8 | never in 7d | 🔴 stale |
| expire-vouchers | manifest, src | 2026-10-20 09:25:30 | 401 | 14 | never in 7d | 🔴 stale |
| reconcile | manifest, src | 2026-10-20 09:25:30 | 401 | 14 | never in 7d | 🔴 stale |
| reap-carts | manifest, src | 2026-10-20 09:25:30 | 401 | 14 | never in 7d | 🔴 stale |
| subscriptions | manifest, src | 2026-10-20 09:25:30 | 401 | 14 | never in 7d | 🔴 stale |
| abandoned-cart | manifest, src | 2026-10-20 09:25:30 | 401 | 41 | never in 7d | 🔴 stale |
| stranded-payments | manifest, src | 2026-10-20 09:25:29 | 401 | 44 | never in 7d | 🔴 stale |
| stock | manifest, src | 2026-10-20 09:25:29 | 401 | 44 | never in 7d | 🔴 stale |
| invoices | manifest, src | 2026-10-20 09:25:29 | 401 | 44 | never in 7d | 🔴 stale |
| health | manifest, src | 2026-10-20 09:25:29 | 401 | 50 | 2026-10-19 04:55:21 | 🔴 stale |
| notifications | manifest, src | 2026-10-20 09:25:29 | 401 | 44 | never in 7d | 🔴 stale |
| daily-deals | main scheduler | 2026-10-20 09:25:28 | 404 | 14 | never in 7d | 🔴 stale |
| wishlist-digest | main scheduler | 2026-10-20 09:25:28 | 404 | 8 | never in 7d | 🔴 stale |
| backup | main scheduler | 2026-10-20 09:25:28 | 404 | 14 | never in 7d | 🔴 stale |
| expire-coupons | main scheduler | 2026-10-20 09:25:28 | 404 | 14 | never in 7d | 🔴 stale |
| deal-scraper | vercel.json, src | none in 7d | n/a | 0 | never in 7d | 🔴 stale |
| fraud-monitor | vercel.json, src | none in 7d | n/a | 0 | never in 7d | 🔴 stale |
| observability-check | vercel.json, src | none in 7d | n/a | 0 | never in 7d | 🔴 stale |
| p95-monitor | vercel.json, src | none in 7d | n/a | 0 | never in 7d | 🔴 stale |
| rfm-segmentation | src | none in 7d | n/a | 0 | never in 7d | 🔴 stale |
| search-report | src | none in 7d | n/a | 0 | never in 7d | 🔴 stale |
| sms-broadcasts | src | none in 7d | n/a | 0 | never in 7d | 🔴 stale |
| stock-notifications | vercel.json, src | none in 7d | n/a | 0 | never in 7d | 🔴 stale |

`search-reindex` moved from 22:07 UTC to 01:17:55 UTC between the first and second pull of this run: the GitHub
scheduler fired again and got 404 again. The one `health` 2xx is 44h old. Every one of the 32 routes is stale over
24h; 24 were attempted and failed, 8 (the 5 `vercel.json` routes plus `rfm-segmentation`, `search-report`,
`sms-broadcasts`) were never called at all in 7 days.

The five `vercel.json` routes (`observability-check`, `fraud-monitor`, `p95-monitor`, `deal-scraper`,
`stock-notifications`) have **0 hits in 7 days** and remain 🔴 stale over 24h. The three owners are unchanged
(a production deploy that carries `vercel.json`, Ofir's `CRON_SECRET`, a manifest dedupe PR to protected `main`),
and none moved between 00:14 and 01:06 UTC.

## 06:41 UTC re-measurement, 21.10 (seventh run)

MCP `get_runtime_logs` was called twice from this session against `team_TUMTPVDP8218QHwedSjmgJWl` /
`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`: filtered (`environment=production`, `query=/api/cron`, `since=7d`, `limit=100`,
window 2026-10-14T06:41:42Z to 2026-10-21T06:41:42Z) and `group_by=requestPath` over `24h`. Both answered
`Vercel API request failed (403: forbidden)` at page 0, request `vs42s-1792564904160`, 0 rows. Same grant failure as
every run since 13:15 UTC on 20.10. The CLI fallback named in the tool's own recovery text was used with the same scope.

| Probe | Result |
|---|---|
| `vercel logs --since 7d --status-code 200 --query "/api/cron"` | **2 rows**, both `/api/cron/health` on `audit/final-audit` at 2026-10-19 04:55:07 and 04:55:21 UTC, now **49h 46m** old |
| `vercel logs --since 7d --status-code 5xx --query "/api/cron"` | **0 rows** |
| `vercel logs --since 24h --query "/api/cron"` (any status, cap 50) | 50 rows, 09:25:29 UTC 20.10 to 05:53:18 UTC 21.10: 401 = 26, 404 = 24 |
| Newest hit of any cron route | `job-dlq` and `search-outbox` 404, `webhook-dlq` 401, at 05:53 UTC from the GitHub scheduler |
| `vercel crons ls --project kenyonexpress` | 5 paths, all **not deployed**, "5 local changes pending deploy" |
| Production alias `kenyonexpress.co.il` | still `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` (`audit/final-audit` @ `337d1a2a`, source `cli`, 2026-10-19 04:43 UTC), `crons: []` |
| `vercel ls --prod` | the same two production deployments, both 2 days old, no new deploy |
| GitHub `cron.yml`, last 6 scheduled runs (01:17 to 05:53 UTC 21.10, all on `main`) | **6 / 6 failed** |
| pg_cron `report_tables_nightly` (management API, read-only) | last success **2026-10-21 01:30:00 UTC**, 0 failures, 🟢 fresh |

Latest run `39552098825` (05:53 UTC, schedule `*/10 * * * *`): `invoices`, `stock`, `stranded-payments` answered `000`
twice each (duplicate manifest names on `main`, curl never reached Vercel), `webhook-dlq` 401, `job-dlq` and
`search-outbox` 404. Identical failure shape to every run since 25.09.

**Per-route last attempt in the 24h window** (06:41 UTC 20.10 to 06:41 UTC 21.10, from the 50-row capped pull,
aggregated by path; routes absent here had no attempt in that window):

| Route | Last attempt (UTC) | Status | Hits 24h |
|---|---|---|---|
| job-dlq | 2026-10-21 05:53:18 | 404 | 6 |
| search-outbox | 2026-10-21 05:53:18 | 404 | 6 |
| webhook-dlq | 2026-10-21 05:53:16 | 401 | 8 |
| email-retry | 2026-10-21 05:08:33 | 404 | 5 |
| whatsapp | 2026-10-21 02:03:14 | 401 | 5 |
| expire-coupons | 2026-10-21 01:30:59 | 404 | 1 |
| expire-cashback | 2026-10-21 01:30:57 | 404 | 1 |
| search-reindex | 2026-10-21 01:17:55 | 404 | 4 |
| wishlist-alerts | 2026-10-20 09:39:21 | 401 | 1 |
| affiliate-payouts, weekly-digest, retention, expire-vouchers, reconcile, reap-carts, subscriptions, abandoned-cart, stranded-payments, stock, invoices, health, notifications | 2026-10-20 09:25:29 to 09:25:31 | 401 or 404 | 1 each |
| observability-check, fraud-monitor, p95-monitor, deal-scraper, stock-notifications (`vercel.json`) | none | n/a | 0 |
| rfm-segmentation, search-report, sms-broadcasts (`src` only) | none | n/a | 0 |

Nothing changed since the 01:06 UTC run except the clock: the `health` 2xx aged from 44h to almost 50h, the GitHub
scheduler added six more failed runs, and the 32-route table in the sixth run still holds (24 attempted and failed,
8 never called). The five `vercel.json` routes remain at **0 hits in 7 days**, 🔴 stale over 24h. The three owners
(a production deploy that carries `vercel.json`, Ofir's `CRON_SECRET`, a manifest dedupe PR to protected `main`) are
unchanged and none is reachable from this loop. Gates on this branch at the time of writing: `pnpm type-check`,
`pnpm lint` and `pnpm build` all exit 0 (204 routes).

## 09:54 UTC re-measurement, 21.10 (eighth run)

MCP `get_runtime_logs` was called twice from this session against `team_TUMTPVDP8218QHwedSjmgJWl` /
`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`: filtered (`environment=production`, `query=/api/cron`, `since=7d`, `limit=100`,
window 2026-10-14T09:54:45Z to 2026-10-21T09:54:45Z) and `group_by=requestPath` over `24h`. Both answered
`Vercel API request failed (403: forbidden)` at page 0, request `qlqh9-1792576491205`, 0 rows. Same grant failure as
every run since 13:15 UTC on 20.10. The CLI fallback named in the tool's own recovery text was used with the same scope.
The first CLI pull (`--since 7d --status-code 200`) answered `Response Error (504)` from the logs API; the retry a
minute later returned rows, so the 504 was transient and is not counted as evidence.

| Probe | Result |
|---|---|
| `vercel logs --since 7d --status-code 200 --query "/api/cron"` | 504 on the first call; retry: **2 rows**, both `/api/cron/health` on `audit/final-audit` at 2026-10-19 04:55:07 and 04:55:21 UTC, now **53h 04m** old |
| `vercel logs --since 7d --status-code 5xx --query "/api/cron"` | **0 rows** |
| `vercel logs --since 24h --query "/api/cron"` (any status, cap 50) | 50 rows, 01:30:57 to 09:40:42 UTC 21.10: 401 = 31, 404 = 19, 25 distinct paths |
| Newest hit of any cron route | `wishlist-alerts` 401 at 09:40:42 UTC from the GitHub scheduler (run `39578795068`, schedule `45 4 * * *`) |
| `vercel crons ls --project kenyonexpress` | 5 paths, all **not deployed**, "5 local changes pending deploy" |
| Production alias `kenyonexpress.co.il` | still `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` (`audit/final-audit` @ `337d1a2a`, source `cli`, 2026-10-19 04:43 UTC), `crons: []` |
| `vercel ls --prod` | newest three production deployments are all 2 days old, no new deploy since the seventh run |
| GitHub `cron.yml`, last 8 scheduled runs (07:04 to 09:40 UTC 21.10, all on `main`) | **8 / 8 failed** |
| pg_cron `report_tables_nightly` (management API, read-only) | **48** succeeded, 0 failed, last success **2026-10-21 01:30:00 UTC**, 🟢 fresh |

The 09:21 UTC scheduler run swept the whole `main` manifest in one pass (09:21:54 to 09:21:59 UTC): every route
that exists on the deployed branch answered 401 (secret mismatch) and every route that does not answered 404.
That single sweep is why 24 of the 25 paths below share the 09:21 timestamp.

**Per-route last attempt in the 24h window** (09:54 UTC 20.10 to 09:54 UTC 21.10, from the 50-row capped pull, so
the window actually starts at 01:30 UTC 21.10; aggregated by path):

| Route | Last attempt (UTC) | Status | Hits in pull |
|---|---|---|---|
| wishlist-alerts | 2026-10-21 09:40:42 | 401 | 2 |
| affiliate-payouts | 2026-10-21 09:21:59 | 404 | 2 |
| weekly-digest, retention, expire-vouchers, reconcile, reap-carts, subscriptions, abandoned-cart, stranded-payments, stock, invoices, health, notifications | 2026-10-21 09:21:57 to 09:21:58 | 401 | 2 each |
| email-retry, daily-deals, backup, expire-coupons, search-reindex, search-outbox, expire-cashback, job-dlq | 2026-10-21 09:21:54 to 09:21:56 | 404 | 2 each |
| wishlist-digest | 2026-10-21 09:21:56 | 404 | 1 |
| whatsapp | 2026-10-21 09:21:55 | 401 | 3 |
| webhook-dlq | 2026-10-21 09:21:54 | 401 | 2 |
| observability-check, fraud-monitor, p95-monitor, deal-scraper, stock-notifications (`vercel.json`) | none | n/a | 0 |
| rfm-segmentation, search-report, sms-broadcasts (`src` only) | none | n/a | 0 |

Nothing changed since the 06:41 UTC run except the clock: the `health` 2xx aged from almost 50h to 53h, the GitHub
scheduler added eight more failed runs, pg_cron logged its 48th success, and the 32-route table in the sixth run still
holds (24 attempted and failed, 8 never called). The five `vercel.json` routes remain at **0 hits in 7 days**, 🔴 stale
over 24h. The three owners (a production deploy that carries `vercel.json`, Ofir's `CRON_SECRET`, a manifest dedupe PR
to protected `main`) are unchanged and none is reachable from this loop.

## 11:10 UTC re-measurement, 21.10 (ninth run)

MCP `get_runtime_logs` was called twice from this session against `team_TUMTPVDP8218QHwedSjmgJWl` /
`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`: filtered (`environment=production`, `query=/api/cron`, `since=7d`, `limit=100`,
window 2026-10-14T11:10:35Z to 2026-10-21T11:10:35Z) and `group_by=requestPath` over `7d`. Both answered
`Vercel API request failed (403: forbidden)` at page 0, request `w4bzw-1792581036795`, 0 rows. Same grant failure as
every run since 13:15 UTC on 20.10; the tool's own recovery text again names the CLI mapping, which was used with the
same scope. All three CLI pulls answered on the first call this time (no 504). Raw rows are in
`logs/cron/ninth-*-2026-10-21T1111Z.jsonl` (untracked evidence, not committed).

| Probe | Result |
|---|---|
| `vercel logs --since 7d --status-code 200 --query "/api/cron"` | **2 rows**, both `/api/cron/health` on `audit/final-audit` at 2026-10-19 04:55:07 and 04:55:21 UTC, now **54h 16m** old |
| `vercel logs --since 7d --status-code 5xx --query "/api/cron"` | **0 rows** |
| `vercel logs --since 24h --query "/api/cron"` (any status, cap 50) | 50 rows, 01:30:57 to 09:40:42 UTC 21.10: 401 = 31, 404 = 19, 25 distinct paths, byte-identical to the eighth run's window |
| Newest hit of any cron route | `wishlist-alerts` 401 at 09:40:42 UTC (GitHub run `39578795068`); **no cron route was hit at all between 09:40 and 11:11 UTC** |
| `vercel crons ls --project kenyonexpress` | 5 paths, all **not deployed**, "5 local changes pending deploy" |
| Production alias `kenyonexpress.co.il` | still `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` (`audit/final-audit`, created 2026-10-19 04:43 UTC), `crons: []` |
| `vercel ls --prod` | newest three production deployments are 2 days old, no new deploy since the eighth run |
| GitHub `cron.yml`, last 8 scheduled runs (07:04 to 09:40 UTC 21.10, all on `main`) | **8 / 8 failed**, the same eight ids as the eighth run; no scheduled run fired after 09:40 UTC |
| pg_cron `report_tables_nightly` (`cron.job` + `cron.job_run_details`, management API, read-only) | **48** succeeded, 0 failed, last run **2026-10-21 01:30:00 UTC** (162 ms), 🟢 fresh |

**Per-route last attempt in the 24h window:** the 50-row pull covers 01:30 to 09:40 UTC 21.10 and is the same set
of rows the eighth run tabulated, so that table stands unchanged: 25 paths attempted and failed (15 × 401 secret
mismatch, 10 × 404 not on the deployed branch), the five `vercel.json` routes and the three `src`-only routes never
called. The only movement since 09:54 UTC is the clock: the one 2xx aged from 53h to 54h, and the GitHub scheduler
fired nothing between 09:40 and 11:11 UTC (`gh run list` shows no run newer than `39578795068`).

**Verdict:** all 5 `vercel.json` routes stale over 24h, 0 hits in 7 days, 🔴 unchanged, ninth consecutive
measurement. The three owners (a production deploy that carries `vercel.json`, Ofir's `CRON_SECRET`, a manifest
dedupe PR to protected `main`) are unchanged and none is reachable from this loop.

## History

- 2026-10-21 11:10 to 11:14 UTC: ninth run. MCP `get_runtime_logs` 403 twice (7d filtered, `group_by=requestPath` 7d, request `w4bzw-1792581036795`), 0 rows.
  CLI: 2 × 200 in 7d, both `health` on 19.10 04:55 UTC (54h 16m old); 0 × 5xx; 24h window 31 × 401 + 19 × 404 (cap 50, 25 paths, identical rows to the
  eighth run, newest 09:40:42 UTC, nothing hit after); `crons ls` 5/5 not deployed; production alias unchanged on `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA`;
  8/8 latest `cron.yml` runs failed, same ids as the eighth run, newest `39578795068`; pg_cron nightly 48/48, last 01:30 UTC. All 5 routes stale over 24h.
- 2026-10-21 09:54 to 09:58 UTC: eighth run. MCP `get_runtime_logs` 403 twice (7d filtered, `group_by=requestPath` 24h, request `qlqh9-1792576491205`), 0 rows.
  CLI: first 7d pull answered 504 from the logs API, retry 2 × 200, both `health` on 19.10 04:55 UTC (53h 04m old); 0 × 5xx; 24h window 31 × 401 + 19 × 404
  (cap 50, 25 paths, one full manifest sweep at 09:21 UTC); `crons ls` 5/5 not deployed; production alias unchanged on `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA`;
  8/8 latest `cron.yml` runs failed, newest `39578795068` at 09:40 UTC (`wishlist-alerts=401`); pg_cron nightly 48/48, last 01:30 UTC. All 5 routes stale over 24h.
- 2026-10-21 06:41 to 06:46 UTC: seventh run. MCP 403 five times, 0 rows: `get_runtime_logs` 7d filtered, `group_by=requestPath` 24h,
  `deploymentId=dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` 7d, staging project `prj_7Ar3dFtaIqemo7bc1Fg7SMh11joY` 7d, and `get_runtime_errors`
  scoped to the five `vercel.json` routes (request `wp6pv-1792565190546`, "project does not exist or you do not have access").
  Then polled `get_runtime_logs` every 10 minutes from 06:47 to 07:39 UTC (five more calls, ten in total this run): 403 every time, the
  grant did not change over the hour. Ofir re-alerted at 06:48 UTC (high priority) with the connector reconnect step.
  CLI: 2 × 200 in 7d, both `health` on 19.10 04:55 UTC (49h 46m old); 0 × 5xx; 24h window 26 × 401 + 24 × 404 (cap 50);
  `crons ls` 5/5 not deployed; production alias unchanged on `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA`; 6/6 latest `cron.yml`
  runs failed, newest `39552098825` at 05:53 UTC; pg_cron nightly succeeded at 01:30 UTC. All 5 routes stale over 24h.
- 2026-10-21 01:06 to 01:19 UTC: sixth run. MCP `get_runtime_logs` 403 three times (7d filtered, `group_by=requestPath` 24h,
  `source=function` 24h) and `get_runtime_errors` 403 once, 0 rows. All 32 routes tabulated individually: 24 attempted and failed, 8 never called.
  CLI: 2 × 200 in 7d, both `health` on 19.10 04:55 UTC (44h old); 0 × 5xx; 24h window 27 × 401 + 23 × 404; `crons ls`
  5/5 not deployed; production alias unchanged on `dpl_AP18UQwUQdhd3XWNo41seDQvAcuA`; 8/8 latest `cron.yml` runs
  failed, newest `39524285650` at 00:56 UTC. All 5 routes stale over 24h. Nothing changed since 00:14 UTC.
- 2026-10-21 00:14 UTC: the grant's shape was pinned down. MCP `get_auth_user` answers `404: not_found. User not found`,
  and `list_projects` with no team answers the same two team projects. The connector therefore holds a team-scoped
  integration token with no user principal and no personal scope; log and observability reads need a scope that
  token was not granted. There is no other team, project, account or endpoint to try from this side. Unblocking is
  a reconnect of the Vercel connector in claude.ai settings with log read for `kenyonexpress-projects`; Ofir was
  told at 23:58 UTC with that exact step.

- 2026-10-20 23:52 UTC: fifth run, part two. `get_observability_schema` and `create_observability_query` via MCP:
  404 "Observability Data not found" (not a 403). Production tables read through the management API: the
  notification outbox has 232 rows and `sent_at` was never set on any, the search outbox has 163 rows never drained,
  1,029 expired carts are unreaped since 05.10, 10 stock reservations expired unreleased since 21.09. pg_cron
  `report_tables_nightly` is the only live scheduler: 47/47 succeeded, last 2026-10-20 01:30 UTC.

- 2026-10-20 23:27 UTC: fifth run. MCP `get_runtime_logs` called twice in-session (7d filtered, and
  `group_by=requestPath` over 24h): both `403: forbidden` at page 0, 0 rows. CLI fallback over 24h: 0 rows with
  status 200, at least 50 rows all 401 or 404, latest attempt 22:33:12 UTC. `crons ls` 5/5 not deployed, no new
  production deployment, 6/6 latest `cron.yml` runs failed with the same `000`/401/404 pattern. All 5 routes stale.

- 2026-10-20 22:24 UTC: three more `get_runtime_logs` variants from the same session, none untried before this:
  team slug `kenyonexpress-projects` + project name `kenyonexpress` answers `404: not_found. Project not found`;
  `deploymentId=dpl_AP18UQwUQdhd3XWNo41seDQvAcuA` (24h) answers `403: forbidden`; staging project
  `prj_7Ar3dFtaIqemo7bc1Fg7SMh11joY` (24h) answers `403: forbidden`. Every addressable form of the read is now
  exhausted. Ofir was sent a high-priority ntfy alert with the connector re-authorization step.
- 2026-10-20 22:18 UTC: fourth run. MCP tools loaded in-session on the first try; `get_runtime_logs` (plain and
  `group_by=requestPath`) and `get_runtime_errors` all 403 at page 0, 0 rows. CLI fallback: 0×2xx, 0×5xx in 7d,
  12/12 GitHub scheduled runs failed, deployment and `crons: []` unchanged. All 5 `vercel.json` routes stale.
- 2026-10-20 20:50 UTC: the 403 was traced to its owner. `vercel api /v1/integrations/configurations?view=account`
  and `?view=project` on team `kenyonexpress-projects` both return `[]`, so no Vercel-side integration or project
  selection restricts the MCP. The CLI identity `kenyonexpress` is `OWNER` of the team (Pro plan). The log-read denial
  therefore sits in the claude.ai connector's OAuth authorization (scopes picked on the Vercel consent screen), which
  only Ofir can re-authorize in claude.ai connector settings. Nothing in the repo or the CLI can widen it. Last-run
  timestamps for this check come from the CLI tables above; the MCP has produced 0 rows on every call today.
- 2026-10-20 20:41 UTC: **`get_runtime_logs` called for real, twice**, from the fifth fresh read-only session of a
  150-second poll (attempts 1 to 4 at 20:23, 20:28, 20:32 and 20:36 UTC saw the server connect but expose no tools).
  Call 1: `environment=production`, `query=/api/cron`, `since=7d`, `limit=100`, window 2026-10-13T20:41:42Z to
  2026-10-20T20:41:42Z. Call 2: `teamId`, `projectId` and `query` only, default 50-minute window 19:51:43Z to 20:41:43Z.
  Both: `Runtime log query failed at page 0: Vercel API request failed (403: forbidden). Forbidden`, 0 rows. Same
  grant failure as 17:46 and 17:52 UTC. The MCP tool's own error text names the CLI mapping used above, so the CLI
  numbers in the 19:56 section are the last-run timestamps for this check.
- 2026-10-20 20:12 to 20:24 UTC: after the 19:56 run the MCP read was retried five ways, none reached Vercel.
  `claude mcp list` at 20:13, 20:14 and 20:18 UTC: `Connected · tools fetch failed — Request timed out`. Three in-session
  tool searches and a resource listing: nothing exposed. Raw probes of `https://mcp.vercel.com/`: GET answers 401 in
  4.2 s (reachable), an unauthenticated `initialize` POST hung past 20 s once (HTTP 000) and then answered 401 in 3.9 s,
  1.9 s and 17.3 s, so the endpoint's latency swings up to the harness's fetch timeout. A fresh read-only `claude -p`
  session from `/tmp` saw no Vercel server at all; a fresh read-only session from the worktree got
  `CONNECT_TIMEOUT: MCP server claude.ai Vercel connection timed out after 30000ms`. The 403 grant failure of 17:46 UTC
  could not even be re-reached today; the blocker moved one layer down, to the connection. Nothing in the repo changes it.
- 2026-10-20 19:56 UTC: third run. MCP tools fetch timed out again (connected, no tools exposed); CLI fallback measured.
  0×2xx, 0×5xx in 7d, 12/12 GitHub scheduled runs failed, deployment and `crons: []` unchanged. All 5 routes stale.
- 2026-10-20 17:52 UTC: grant enumerated via MCP. One team, two projects (production and staging), `get_runtime_logs`
  403 on both. Log-read scope is absent from the connector grant; nothing further to try from the repo.
- 2026-10-20 17:46 UTC: `get_runtime_logs` called from a fresh read-only session after the connector recovered:
  403 forbidden on both attempts (7d filtered and bare), 0 rows. Grant failure confirmed a second time today.
- 2026-10-20 17:10 UTC: re-run of this check. MCP tool fetch timed out in-session (harness to mcp.vercel.com); CLI
  fallback measured. 0×2xx, 0×5xx in 7d, 12/12 GitHub
  scheduled runs failed, deployment and `crons: []` unchanged.
- 2026-10-20 13:15 UTC: first measured check. MCP log reads 403, CLI fallback measured. 0×2xx in 7d.
- 2026-10-20 07:45 UTC: previous loop marked the 5 `vercel.json` routes STALE via CLI, 0 executions in 48h.
- 2026-10-20 ~20:50 (session clock): a loop recorded "BLOCKED, MCP needs OAuth". Superseded: MCP is authenticated,
  the block is a team-scope 403 on the connector grant, not OAuth.
- 2026-09-25: GitHub scheduler reaches a current deployment and every job answers 401 (secret mismatch), 40/40 runs failed.
