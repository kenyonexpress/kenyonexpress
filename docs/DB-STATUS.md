# Database Status Report: Connection Pool and Query Performance

**Last Updated:** 2026-10-21 01:53 UTC (MAINTENANCE_LOOP_9 sixth measured pass, through the Supabase MCP)
**Previous Run:** 2026-10-20 23:56 UTC (fifth measured pass; 22:45 UTC was the fourth, 21:24 UTC the third, 18:21 UTC the second, 16:24 UTC the first, and the 13:23 UTC report before it was code analysis only)
**Scope:** Supabase connection pool, pooler configuration, pg_stat_statements, performance advisors
**Evidence:** `logs/maint9/result.json` (every probe row), `logs/maint9/pooler.json`, `logs/maint9/pgbouncer.json`, `logs/maint9/rate-limit-probe.json` (the follow-up on the one new spike, section 4)
**Probe:** `scripts/db-mcp-probe.mjs` (the official `@supabase/mcp-server-supabase` run locally in `--read-only` mode; see the header comment for the token recipe)

---

## Executive Summary

**Connection pool:** healthy. 14 of 60 backends in use (23.3%), 0 lock waits, 0 statements running longer than 500 ms at probe time, 0 deadlocks since the stats reset.
**Query performance:** no application statement averages over 500 ms. Six statements do average over 500 ms, and all six are Supabase platform traffic (dashboard, pg-meta introspection, this report's own probes). Seven application statements have a single recorded spike over 500 ms with single-digit or double-digit millisecond means; the seventh is new this pass (rpc `check_rate_limit`, one call at 1,137 ms inside the window, mean unchanged at 10.6 ms).
**Alert status:** no alert for application queries. The one new spike is a single call and is traced in section 4; it does not move the mean, so it stays below the alert line this report uses (mean over 500 ms).

What changed since the previous report (117 minutes earlier): one thing. The pool is the same 14 of 60 backends, the same four clients, the same 13 idle plus the probe itself. pg_stat_statements tracks the same 4,875 distinct statements and grew by 47,242 calls and 14.9 s of execution time. The 6 platform rows over 500 ms by mean are the identical rows with the identical max values. The application spike list grew from 6 to 7: the rate limiter RPC (`check_rate_limit`, `src/lib/utils/rate-limit.ts`) recorded a 1,137.4 ms max that was not there at 23:56 UTC. It is one call out of 248 in the window (the other 247 average 7.1 ms, under the 10.6 ms lifetime mean), and `pg_stat_user_tables` shows `rate_limits` was autoanalyzed at 00:53:54 UTC, inside the window. Section 4 has the arithmetic. The other six spike maxima did not move. Advisor counts are unchanged (1 WARN initplan, 14 WARN multiple-permissive, 9 unindexed FKs, 157 unused indexes). Database size still 44 MB (carts grew by 123 live rows, 3,860 now). Temp files grew by 219, all from this report's own pg_stat_statements probes (39 MB per set, section 2). Pooler and pgbouncer configuration re-read from the management API: byte-identical to the 16:24 UTC read.

Across the six measured passes (16:24, 18:21, 21:24, 22:45, 23:56 and 01:53 UTC) six of the seven application spike maxima have not moved by a single millisecond while the call counts behind them keep growing, which is the evidence that they are historical outliers and not a recurring slow path. The seventh is the first spike observed live between two passes; it needs a second occurrence before it counts as recurring.

The 13:23 UTC report's pool figures (max 20, 18 available, "0 to 8 active") were assumptions from the plan tier and were wrong; the instance runs `max_connections = 60`.

---

## 1. Connection Pool

### Postgres instance (pg_settings, measured)

| Setting | Value |
|---|---|
| server_version | 17.6 (Supabase build 17.6.1.111, release channel ga) |
| max_connections | 60 |
| superuser_reserved_connections | 3 |
| statement_timeout | 120000 ms |
| idle_in_transaction_session_timeout | 0 (disabled) |
| shared_buffers | 224 MB (28672 x 8 kB) |
| work_mem | 2184 kB |
| Region | eu-north-1, status ACTIVE_HEALTHY |

### Pooler (management API `config/database/pooler` and `pgbouncer`)

| Setting | Value |
|---|---|
| Pooler host | aws-1-eu-north-1.pooler.supabase.com:6543 |
| pool_mode | transaction |
| default_pool_size | null (platform default for the compute size) |
| max_client_conn | null (platform default) |
| server_idle_timeout | 600 s |
| server_lifetime | 3600 s |
| query_wait_timeout | 80 s |
| reserve_pool_size | 1 |

The application does not use the pooler port. Every application statement arrives through PostgREST (REST and RPC), which keeps its own persistent pool against the direct database port. `@supabase/ssr` clients talk HTTP to PostgREST and are wrapped in `timeoutFetch` (10 s deadline, `src/lib/supabase/timeout-fetch.ts`).

### Backends at probe time (pg_stat_activity, client backends only)

| Application | Role | Backends | State |
|---|---|---|---|
| PostgREST 14.5 | authenticator | 11 | idle (persistent pool, oldest idle 53.4 days) |
| postgres_exporter | supabase_admin | 1 | idle |
| (none) | supabase_admin | 1 | idle |
| mgmt-api | supabase_read_only_user | 1 | active (this probe) |

Totals: 14 client backends of 60 (23.3%), `numbackends` 16 including platform workers. Lock waits: 0. Statements older than 500 ms still running: 0. Deadlocks: 0. Buffer cache hit: 100.00%.

Transactions since the database stats were created: 8,604,794 commits and 632,517 rollbacks (6.8%); since the 23:56 UTC pass, 27,044 commits and 5,811 rollbacks. The rollback share is dominated by read-only wrappers that end in ROLLBACK by design (the MCP `--read-only` mode and the management-API rehearsals in `docs/RUNBOOK.md`), not by failed application writes.

### Auth server

The performance advisor `auth_db_connections_absolute` (INFO) reports the Auth server pinned at an absolute 10 connections. That is a platform setting; it matters only if the compute size is ever raised, because Auth would not scale with it.

---

## 2. Query Performance (pg_stat_statements 1.11, schema `extensions`)

Statistics window: since the reset on 2026-07-16 19:10 UTC (96 days).

| Metric | Value |
|---|---|
| Distinct statements tracked | 4,875 |
| Total calls | 7,393,431 (+47,242 since 23:56 UTC) |
| Total execution time | 3,019,182 ms (50.3 minutes over 96 days) |
| Statements with mean over 500 ms | 6 (0 application) |
| Statements with max over 500 ms | 20 (7 application, 13 platform) |
| Temp files written (pg_stat_database) | 165,769, of which 6.27 GB belongs to one pg-meta functions listing; the 219 new since 23:56 UTC are this probe's own pg_stat_statements scans (39 MB per set, 11 sets so far) |

### Application statements by total time

| Calls | Mean ms | Total ms | Statement |
|---|---|---|---|
| 44,189 | 4.0 | 175,255 | `seo_redirects` lookup by source_path (proxy redirect check) |
| 19,994 | 5.4 | 108,641 | rpc `available_stock(p_product_id)` (`src/lib/commerce/stock-live.ts`) |
| 9,749 | 10.6 | 103,501 | rpc `check_rate_limit(p_key, p_max_attempts, p_window_seconds)` (`src/lib/utils/rate-limit.ts`) |
| 887 | 46.3 | 41,108 | rpc `search_products(q, max_results)` |
| 163,434 | 0.2 | 36,750 | `products` select by slug |
| 2,055 | 16.4 | 33,789 | `analytics_events` select by event_name and occurred_at |
| 6,428 | 5.2 | 33,672 | `carts` INSERT |
| 365 | 90.9 | 33,196 | rpc `release_expired_orders` (cron) |

The busiest application read, the products select by slug, averages 0.2 ms. Nothing in the application path is near the 500 ms line on average.

---

## 3. Platform Statements Over 500 ms (not application traffic)

These six are the only rows with a mean over 500 ms. None is issued by the storefront, the admin, the cron routes or the mobile app. They are the Supabase dashboard, pg-meta (the dashboard's schema introspection service) and earlier verification sessions' management-API probes.

| Calls | Mean ms | Max ms | Statement | Source |
|---|---|---|---|---|
| 594 | 566.7 | 2,557.4 | `SELECT name FROM pg_timezone_names` | dashboard SQL editor |
| 384 | 703.6 | 1,673.8 | pg-meta functions listing (`arg_modes` CTE), 6.27 GB of temp files | dashboard |
| 5 | 1,511.6 | 2,070.9 | pg-meta tables listing (`relrowsecurity`) | dashboard |
| 1 | 1,206.6 | 1,206.6 | paged tables listing | dashboard |
| 1 | 1,133.6 | 1,133.6 | `information_schema` foreign-key walk | a verification session |
| 1 | 744.9 | 744.9 | `pg_temp.count_or_err` row counter | a verification session |

Action: none in the application. The functions listing spilling 6.27 GB to temp files over 384 calls is a consequence of `work_mem = 2184 kB` on the Nano compute; it only runs when someone opens the dashboard's database pages.

---

## 4. Application Spikes Over 500 ms (max only, mean well under)

| Calls | Mean ms | Max ms | Stddev ms | Statement |
|---|---|---|---|---|
| 1,392 | 3.9 | 1,159.2 | 31.8 | `carts` UPDATE (expires_at, items) |
| 9,749 | 10.6 | 1,137.4 | 19.3 | rpc `check_rate_limit` (`src/lib/utils/rate-limit.ts`) **new this pass** |
| 19,994 | 5.4 | 1,013.8 | 16.0 | rpc `available_stock` |
| 6,428 | 5.2 | 883.6 | 17.4 | `carts` INSERT |
| 887 | 46.3 | 857.1 | 66.0 | rpc `search_products` |
| 1,946 | 14.8 | 525.3 | 20.7 | rpc `fn_record_search` (`src/lib/search/record.ts`) |
| 2,055 | 16.4 | 515.6 | 34.9 | `analytics_events` select |

Each is a single outlier in a 96-day window with a mean under 50 ms and a standard deviation an order of magnitude below the max. The shape matches cold cache after a compute pause or a plan re-prepare, not a missing index: `carts` has 113,365 index scans against 60 sequential scans, and `analytics_events` 4,755 against 24. Six of the seven max values did not move across the 16:24, 18:21, 21:24, 22:45, 23:56 and 01:53 runs while the call counts did (since 23:56: carts UPDATE +18, `available_stock` +355, carts INSERT +124, `fn_record_search` +56; `search_products` and the `analytics_events` select were not called at all in the window), so those six are historical, not recurring. No alert.

### The new `check_rate_limit` spike (first seen 01:53 UTC)

At 23:56 UTC the rate limiter RPC had 9,501 calls, 100,610 ms total and a max under 500 ms (it was absent from the max-over-500 list). At 01:53 UTC it has 9,749 calls, 103,501 ms total and a max of 1,137.4 ms. The window therefore holds 248 calls and 2,891 ms; subtracting the one 1,137 ms call leaves 247 calls at 7.1 ms, under the 10.6 ms lifetime mean. The follow-up probe (`logs/maint9/rate-limit-probe.json`) shows the statement at 1,127,203 shared buffer hits and 0 disk reads over its lifetime, 0 temp blocks, one row per call, so it is not an I/O or spill event. Two facts from the same probe are the candidates:

- `pg_stat_user_tables.rate_limits` reports `last_autoanalyze` at 2026-10-21 00:53:54 UTC, inside the window (624 live rows, 104 dead, 288 kB). A call that lands during the analyze waits on the relation's share-update-exclusive lock only for the statistics write, which is short on a 288 kB table, so this explains some latency but not a full second on its own.
- The function is a single-row `INSERT ... ON CONFLICT (key) DO UPDATE` (definition read from production in the same probe, identical to `supabase/migrations/002_auth_rate_limits.sql`). Concurrent calls for the same `p_key` serialise on that row's lock, and the cart write limiter keys by IP (`cart_write:ip:<ip>`, 120 per hour, `src/server/actions/cart.ts`), so a burst from one address queues behind itself. A single 1.1 s wait is the signature of one such burst meeting a lock holder that was itself slow, for example the analyze above.

Neither candidate is proven from one sample. The rule for this report stays the same: a second occurrence between two passes (max moving again, or `over_500_max` for this statement growing) promotes it to a recurring path and the fix is already drafted, `migrations/applied/145_revoke_check_rate_limit_execute.sql` plus the Upstash limiter in `src/lib/rate-limit/limiter.ts`, which `src/lib/env.ts` documents as the primary backend once both Upstash variables are set (no environment sets them today). Until then it is a single spike with a 10.6 ms mean and 19.3 ms stddev, and no alert.

The `search_products` RPC is the one worth watching: a 46 ms mean with 66 ms stddev is the widest spread in the application set. It is the Postgres fallback that production uses because Meilisearch is off (`docs/` UX21 notes); it does not get faster until the engine is switched.

---

## 5. Performance Advisors (get_advisors type=performance)

| Advisor | Level | Count | Notes |
|---|---|---|---|
| auth_rls_initplan | WARN | 1 | `profiles.profiles_super_admin_mfa` re-evaluates `auth.<fn>()` per row. Wrap it in `(select ...)`. Candidate for the next migration batch in `migrations/pending/`. |
| multiple_permissive_policies | WARN | 14 | banners, cashback_ledger, homepage_sections, payment_events, payout_statement_lines, payout_statements, refunds, supplier_branches (4 actions), support_ticket_messages, support_tickets, whatsapp_contacts. Each pair is an owner policy plus a staff policy; Postgres evaluates both on every row. Correct but slower. |
| unindexed_foreign_keys | INFO | 9 | affiliate_attributions (3), affiliate_links, affiliate_payouts, auth_wa_otps, supplier_card_tokens (2), supplier_card_verifications. All low-row tables today. |
| unused_index | INFO | 157 | Largest is `idx_audit_log_action` at 120 kB. Total waste is small; no action. |
| auth_db_connections_absolute | INFO | 1 | See section 1. |

None of these is a slow-query cause today. The two WARN rows are the only ones that scale with traffic, and both are policy shape, not data volume.

---

## 6. Storage

| Item | Value |
|---|---|
| Database size | 44 MB (unchanged since 21:24 UTC; 43 MB at 18:21 UTC) |
| Largest table | audit_log, 5,824 kB, 2,391 live rows |
| carts | 2,304 kB, 3,860 live rows (208 dead), autovacuum 2026-10-16 |
| analytics_events | 1,960 kB, 2,685 live rows |
| products | 752 kB, 82 live rows, 66 dead rows, autovacuum 2026-10-18 |
| Replication slots | none (the application does not use Realtime; the `wal->>` poller rows in pg_stat_statements are historical platform traffic) |

---

## 7. Verification Checklist (2026-10-21 01:53 UTC)

- [x] Supabase MCP reached (official server over stdio, `--read-only`, 13 tools listed)
- [x] Pool measured from pg_stat_activity, not inferred from the plan tier
- [x] Pooler configuration re-read from the management API (unchanged)
- [x] pg_stat_statements queried for mean and max over 500 ms
- [x] Statements classified as application versus platform (`classifyStatement`, tested)
- [x] Performance advisors fetched
- [x] No application statement with mean over 500 ms
- [x] The one new max-over-500 row (`check_rate_limit`) traced to a single call with a follow-up probe (section 4)
- [ ] Re-check `check_rate_limit` max on the next pass; a second move promotes it to recurring
- [x] Probe script under test: `scripts/db-mcp-probe.test.mjs`
- [ ] `profiles_super_admin_mfa` initplan fix (next migration batch, needs approval like every migration)
- [ ] Re-run after Meilisearch is enabled in production to retire the `search_products` fallback row

---

## 8. How to Re-run

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d) \
  node scripts/db-mcp-probe.mjs > logs/maint9/result.json
```

The script prints a one-line summary on stderr (`pool 14/60 (23.3%), statements over 500ms by mean: 6 (app: 0), app spikes: 7`) and writes the full JSON on stdout. `summary.alert` is true only when an application statement averages over 500 ms.

Reading the raw numbers afterwards:

```bash
node -e 'const r=require("./logs/maint9/result.json"); console.log(JSON.stringify(r.summary,null,1))'
```

---

**Report Status:** COMPLETE (measured 2026-10-21 01:53 UTC; sixth measured pass, one new single-call spike on `check_rate_limit`, mean unchanged, no alert)
**Next Review:** MAINTENANCE_LOOP cycle, or after any migration in the pending batch is applied
**Escalation:** none required
