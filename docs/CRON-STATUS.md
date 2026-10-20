# Cron Routes Status

**Last check:** 2026-10-20 20:41 UTC (MAINTENANCE_LOOP_5, third run today; MCP `get_runtime_logs` called, 403)
**Status:** 🔴 CRITICAL, unchanged since 13:15 UTC. No cron route has completed successfully in production in the last 7 days. 0 requests with status 2xx, 0 with 5xx; every hit is 401 or 404.

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

## History

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
