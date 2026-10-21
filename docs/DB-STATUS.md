# Database Status Report: Connection Pool and Query Performance

**Last Updated:** 2026-10-21 14:34 UTC (MAINTENANCE_LOOP_9 thirteenth measured pass, through the Supabase MCP)
**Previous Run:** 2026-10-21 13:07 UTC (twelfth measured pass, `logs/maint9/result-12.json`. Before it: 11:45 UTC the eleventh (`result-11.json`), 10:22 UTC the tenth (`result-10.json`), 08:14 UTC the ninth (`result-09.json`), 02:51 UTC the eighth (its header once said "10:00 UTC", the local wall clock; `result-08.json` carries the true `ts` of 02:51:00Z), 01:59 UTC the seventh, 01:53 UTC the sixth, 23:56 UTC the fifth, 22:45 UTC the fourth, 21:24 UTC the third, 18:21 UTC the second, 16:24 UTC the first, and the 13:23 UTC report before it was code analysis only)
**Scope:** Supabase connection pool, pooler configuration, pg_stat_statements, performance advisors
**Evidence:** `logs/maint9/result-13.json` (every probe row of this pass; `result-12.json`, `result-11.json`, `result-10.json`, `result-09.json`, `result-08.json` and `result.json` are the six passes before it), `logs/maint9/pooler.json`, `logs/maint9/pgbouncer.json`, `logs/maint9/rate-limit-probe.json` (the 01:53 UTC follow-up on the `check_rate_limit` spike), `logs/maint9/rate-limit-probe-12.json` (the 13:07 UTC follow-up on that row's stddev movement) and `logs/maint9/rate-limit-probe-13.json` (the 14:34 UTC re-check of the same row, section 4)
**Probe:** `scripts/db-mcp-probe.mjs` (the official `@supabase/mcp-server-supabase` run locally in `--read-only` mode; see the header comment for the token recipe)

---

## Executive Summary

**Connection pool:** healthy. 14 of 60 backends in use (23.3%), 0 lock waits, 0 statements running longer than 500 ms at probe time, 0 deadlocks since the stats reset.
**Query performance:** no application statement averages over 500 ms. Six statements do average over 500 ms, and all six are Supabase platform traffic (dashboard, pg-meta introspection, this report's own probes). Seven application statements have a recorded spike over 500 ms with single-digit or double-digit millisecond means; none of the seven maxima moved this pass. The 13:07 watch item, rpc `check_rate_limit`, was quiet this window: 156 new calls at a 10.9 ms window mean, stddev down from 22.85 to 22.75 ms, and the variance arithmetic in section 4 bounds the slowest call in the window at about 220 ms. `rate_limits` was autoanalyzed inside this window too (13:45:31 UTC), so the autoanalyze-then-spike correlation the 13:07 pass leaned on is now one for three in today's windows with an autoanalyze: a candidate, not a mechanism.
**Alert status:** no alert for application queries. No application mean is near 500 ms (the worst is `search_products` at 46.3 ms), so nothing crosses the alert line this report uses (mean over 500 ms). `check_rate_limit` stays a watch item for one more pass: see section 4.

What changed since the previous report (1 hour 27 minutes earlier, 13:07 to 14:34 UTC): no new slow path appeared, and no mean moved by more than 0.2 ms. The pool is the same 14 of 60 backends, the same four clients, the same 13 idle. pg_stat_statements tracks 4,907 distinct statements (+9 since 13:07; `stats_since` dates eight of them to 13:08 and 13:09 UTC, the twelfth pass's own attribution query and its seven `rate-limit-probe-12` follow-up statements, and the ninth to 14:07 UTC, a one-call `cron.job` / `cron.job_run_details` read from another session; none over 58.7 ms, none application traffic) and grew by 30,415 calls and 18.3 s of execution time, again real application traffic: carts UPDATE +10 calls, carts INSERT +47, `available_stock` +149, `check_rate_limit` +156, `fn_record_search` +24, the products select by slug +42 and the `seo_redirects` lookup +132; `search_products`, the `analytics_events` select and `release_expired_order_discounts` had no calls in the window. The 6 platform rows over 500 ms by mean are unchanged, call for call. The application spike list remains 7 and every max is identical to the millisecond while 386 calls were added across the seven rows; the means that moved are carts INSERT (5.4 to 5.5 ms) and `fn_record_search` (15.3 to 15.5 ms). Three stddevs moved: carts UPDATE 31.9 to 31.8, `check_rate_limit` 22.8 to 22.7 (unrounded 22.85 to 22.75) and `fn_record_search` 20.8 to 21.1 ms, the last on 24 calls and 276 ms of execution (an 11.5 ms window mean, below its 15.5 ms lifetime mean, so the stddev rise is the low side of the distribution widening, not a slow call). Temp files grew by 174 and every writer is the probe's own `pg_stat_statements` scan (one more call each) or pg-meta (no application statement writes temp). Advisor counts: 1 + 14 WARN unchanged, INFO 9 + 156 + 1, the `unused_index` list down by one because `idx_orders_user_status` on `orders` recorded its first scan (1 scan, 99 tuples) in the window; no new statement since 13:07 touches `orders`, so an existing orders-by-user-and-status select finally hit that index. Database size 46 MB (unchanged); audit_log grew from 2,866 to 3,005 live rows (7,248 to 7,648 kB), carts from 4,222 to 4,268 live (409 to 434 dead), analytics_events from 2,685 to 2,769 live (autovacuumed 21.10), vouchers from 87 to 96 live, notification_outbox from 322 to 350 live, refresh_tokens from 101 to 105 live and rate_limits from 702 to 717 live (164 to 176 dead); products dead rows rose from 28 to 37, and `users` dropped from 50 dead rows to 1 after an autovacuum on 21.10. Pooler and pgbouncer configuration re-read from the management API and byte-identical to the stored copies (same SHA-1 of the sorted JSON).

Across the thirteen measured passes (16:24, 18:21, 21:24, 22:45, 23:56, 01:53, 01:59, 02:51, 08:14, 10:22, 11:45, 13:07 and 14:34 UTC) all seven application spike maxima stand: six have not moved by a single millisecond since 16:24 UTC, and the seventh (check_rate_limit) has not moved since it was first seen at 01:53 UTC, through 1,104 new calls at a 10.6 ms mean. The 13:07 variance movement in that row did not repeat this pass (section 4). No alert, no fix needed.

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
| PostgREST 14.5 | authenticator | 11 | idle (persistent pool, oldest idle 53.8 days) |
| postgres_exporter | supabase_admin | 1 | idle |
| (none) | supabase_admin | 1 | idle |
| mgmt-api | supabase_read_only_user | 1 | active (this probe) |

Totals: 14 client backends of 60 (23.3%), `numbackends` 16 including platform workers. Lock waits: 0. Statements older than 500 ms still running: 0. Deadlocks: 0. Buffer cache hit: 100.00%. Every idle backend is waiting on `ClientRead` (the 14:34 follow-up, `activity_wait_events` in `rate-limit-probe-13.json`), none on a lock or IO.

Transactions since the database stats were created: 8,765,406 commits and 643,355 rollbacks (6.8%); since the 13:07 UTC pass, 21,496 commits and 1,570 rollbacks. The rollback share is dominated by read-only wrappers that end in ROLLBACK by design (the MCP `--read-only` mode and the management-API rehearsals in `docs/RUNBOOK.md`), not by failed application writes.

### Auth server

The performance advisor `auth_db_connections_absolute` (INFO) reports the Auth server pinned at an absolute 10 connections. That is a platform setting; it matters only if the compute size is ever raised, because Auth would not scale with it.

---

## 2. Query Performance (pg_stat_statements 1.11, schema `extensions`)

Statistics window: since the reset on 2026-07-16 19:10 UTC (97 days).

| Metric | Value |
|---|---|
| Distinct statements tracked | 4,907 (+9 since 13:07 UTC: eight from the twelfth pass's own follow-up probes, one `cron.job` inspection from another session, dated by `stats_since`) |
| Total calls | 7,618,356 (+30,415 since 13:07 UTC) |
| Total execution time | 3,114,211 ms (51.9 minutes over 97 days) |
| Statements with mean over 500 ms | 6 (0 application) |
| Statements with max over 500 ms | 20 (7 application, 13 platform) |
| Temp files written (pg_stat_database) | 167,223 (+174 since 13:07 UTC; every writer in `temp_spill` is this probe's own pg_stat_statements scan or pg-meta, no application statement) |

### Application statements by total time

| Calls | Mean ms | Total ms | Statement |
|---|---|---|---|
| 45,347 | 4.0 | 180,103 | `seo_redirects` lookup by source_path (proxy redirect check) |
| 21,379 | 5.4 | 115,955 | rpc `available_stock(p_product_id)` (`src/lib/commerce/stock-live.ts`) |
| 10,853 | 10.6 | 115,030 | rpc `check_rate_limit(p_key, p_max_attempts, p_window_seconds)` (`src/lib/utils/rate-limit.ts`) |
| 887 | 46.3 | 41,108 | rpc `search_products(q, max_results)` |
| 6,850 | 5.5 | 37,349 | `carts` INSERT |
| 163,569 | 0.2 | 36,800 | `products` select by slug |
| 2,055 | 16.4 | 33,789 | `analytics_events` select by event_name and occurred_at |
| 2,157 | 15.5 | 33,428 | rpc `fn_record_search` (`src/lib/search/record.ts`; entered the top 15 by total time this pass) |
| 365 | 90.9 | 33,196 | rpc `release_expired_order_discounts` (cron; left the probe's top 15 this pass, row re-read directly, unchanged since 13:07) |

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
| 1,483 | 4.1 | 1,159.2 | 31.8 | `carts` UPDATE (expires_at, items) |
| 10,853 | 10.6 | 1,137.4 | 22.7 | rpc `check_rate_limit` (`src/lib/utils/rate-limit.ts`) |
| 21,379 | 5.4 | 1,013.8 | 15.8 | rpc `available_stock` |
| 6,850 | 5.5 | 883.6 | 17.5 | `carts` INSERT |
| 887 | 46.3 | 857.1 | 66.0 | rpc `search_products` |
| 2,157 | 15.5 | 525.3 | 21.1 | rpc `fn_record_search` (`src/lib/search/record.ts`) |
| 2,055 | 16.4 | 515.6 | 34.9 | `analytics_events` select |

All seven have means under 50 ms and standard deviations an order of magnitude below the max in a 97-day window. The shape matches cold cache after a compute pause or a plan re-prepare, not a missing index: `carts` has 120,350 index scans against 60 sequential scans, and `analytics_events` 4,755 against 24. All seven max values held across the 16:24, 18:21, 21:24, 22:45, 23:56, 01:53, 01:59, 02:51, 08:14, 10:22, 11:45, 13:07 and 14:34 UTC runs while cumulative call counts grew (386 new application calls across the seven rows in the 13:07 to 14:34 window, on top of 354 in the window before). Every row moved by at most 0.2 ms in mean and 0.3 ms in stddev; `check_rate_limit`, which moved 3.3 ms in stddev in the window before, moved back by 0.1 ms. The next subsection records the re-check. No alert, no fix needed.

### The `check_rate_limit` spike (first seen 01:53 UTC; max unmoved through 14:34 UTC, variance moved at 13:07 UTC and settled at 14:34 UTC)

**14:34 UTC window (13:07 to 14:34, `logs/maint9/rate-limit-probe-13.json`).** 156 new calls and 1,696.3 ms of new execution (`total_exec_time` 113,333.5 to 115,029.8 ms), a 10.9 ms mean inside the window against 21.1 ms in the window before and 10.6 ms lifetime. Max unchanged at 1,137.4 ms; stddev down from 22.85 to 22.75 ms (unrounded in both follow-up files). Sum of squares from `calls × (stddev² + mean²)`: 6,835,554 ms² now against 6,785,900 ms² at 13:07, so the 156 new calls contributed 49,654 ms². The square root of that delta, 223 ms, is the hardest upper bound on any single call in the window (it would require the other 155 to take zero time), so nothing in this window came within a factor of two of 500 ms. `rate_limits` was autoanalyzed inside this window as well, at 13:45:31 UTC (`autoanalyze_count` 188 to 189, `n_live_tup` 702 to 717, 164 to 176 dead, `last_autovacuum` still 2026-10-15), and it produced no slow call. That makes the autoanalyze correlation one for three today: the 01:53 and 13:07 slow windows each had one, and so did this quiet one. It is still the only candidate on the table, but it is not sufficient on its own; a lock or a cold plan-cache miss that happens to follow some analyzes and not others fits the three observations equally. `shared_blks_read` stays at 0 across all 10,853 calls, `rate_limits_key_key` carries 14,214 of 14,221 index scans, `pg_stat_user_functions` is still empty (`track_functions = none`), `log_min_duration_statement` is still -1 and `pg_stat_statements.track` still `top`, so per-call attribution remains impossible from this instance. Watch item stays open for one more pass; two quiet windows in a row return it to a closed historical spike.

**13:07 UTC window (11:45 to 13:07).** 135 new calls and 2,847.5 ms of new execution (`total_exec_time` 110,486 to 113,333.5 ms), a 21.1 ms mean inside the window against 12.4 ms in the window before and 10.6 ms lifetime. The max did not move (1,137.4 ms), but the population stddev rose from 19.5 to 22.85 ms. Sum of squares from `calls × (stddev² + mean²)`: 6.78 M ms² now against 5.15 to 5.21 M ms² at 11:45 (the 11:45 values are rounded to 0.1 ms, hence the band), so the 135 new calls contributed 1.57 to 1.64 M ms². A single call cannot do that under the unchanged max (1,137.4² = 1.29 M ms²), so the window held at least two calls over roughly 450 ms, and the standing max bounds every one of them. With 133 ordinary calls at the lifetime 8 to 10 ms, the arithmetic fits two calls near 870 ms, or one near 1,100 ms plus one near 550 ms. This is the first evidence of a slow call in this row since the 1,137.4 ms max was recorded, and it is a sub-max recurrence, not a new max.

What the 13:07 follow-up (`logs/maint9/rate-limit-probe-12.json`) rules in and out:

- `rate_limits` was autoanalyzed at 12:20:27 UTC, inside the window (`autoanalyze_count` 188, `last_autovacuum` still 2026-10-15). The 01:53 follow-up named an autoanalyze at 00:53:54 UTC, just before that spike window. Two for two, which makes plan invalidation after analyze (PostgREST re-prepares its statement and the plpgsql function re-plans its cached statements) the leading candidate. It is a correlation, not a measurement; an analyze of a 312 kB table takes milliseconds and the lock it takes does not block the `INSERT ... ON CONFLICT`.
- Not disk: the row has `shared_blks_read` 0 across all 10,697 calls (1,180,055 hits), so no call in this window or any earlier one waited on a block read.
- Not bloat and not a missing index: 702 live rows, 164 dead (under the 190-row autovacuum threshold), 78% of updates are HOT, and the `UNIQUE (key)` index carries 14,058 of 14,065 index scans. `rate_limits_key_idx` still exists (2 scans); the 26 `DROP INDEX IF EXISTS` calls in pg_stat_statements are rolled-back rehearsals of the pending migration that removes it.
- Not now: at probe time all 13 idle backends were on `ClientRead`, 0 lock waits, 0 statements running over 500 ms.
- Cannot be attributed per call from this instance: `track_functions = none`, `track_io_timing = off`, `log_min_duration_statement = -1` and `pg_stat_statements.track = top`, so the nested statement inside the function is not tracked and no slow-statement log line exists. Turning on `log_min_duration_statement = 500` would show the next one with its exact timestamp and parameters; that is a production Postgres config change through the management API and is left for Ofir to approve, not made by this pass.

What the 13:07 pass asked the next pass to check: a third movement after another autoanalyze would have confirmed the mechanism, a return to a 10 to 12 ms window mean with the stddev flat would leave it at two isolated windows in a day. The 14:34 window above delivered the second outcome (10.9 ms window mean, stddev down 0.1 ms) with an autoanalyze inside it, which also weakens the mechanism half of the first outcome.

**Earlier history (23:56 UTC on 20.10 to 11:45 UTC on 21.10).**

At 23:56 UTC the rate limiter RPC had 9,501 calls, 100,610 ms total and a max under 500 ms (it was absent from the max-over-500 list). At 01:53 UTC it had 9,749 calls, 103,501 ms total and a max of 1,137.4 ms (248 new calls and 2,891 ms in the 117-minute window). At 01:59 UTC it still had 9,749 calls and a max of 1,137.4 ms (zero new calls in the 6-minute window). At 02:51 UTC it had 9,858 calls, at 08:14 UTC 10,232 calls (374 new calls in 5 hours 23 minutes, 2,393 ms of execution, a 6.4 ms mean inside the window, stddev down from 19.3 to 18.9 ms) at 10:22 UTC 10,428 calls (196 new calls in 2 hours 8 minutes, 2,209 ms of execution, an 11.3 ms mean inside the window, stddev 19.4 ms) and at 11:45 UTC 10,562 calls (134 new calls in 1 hour 23 minutes, 1,659 ms of execution, a 12.4 ms mean inside the window, stddev 19.5 ms), still with the same 1,137.4 ms max. Through those 813 calls the max did not move and neither did the stddev beyond 0.1 ms, so until 13:07 UTC it read as a historical spike with no recurring slow path. Candidates from the 01:53 follow-up probe (`logs/maint9/rate-limit-probe.json`) were an autoanalyze of the 288 kB `rate_limits` table (00:53:54 UTC, just before the spike window) and concurrent lock contention on the single-row `INSERT ... ON CONFLICT` that implements the rate limit. Call density remains low (10,697 total calls over 51 days since the row's `stats_since` of 2026-08-31, about 210 per day). The 13:07 window above is the first sign that the autoanalyze candidate repeats. No alert: the lifetime mean is 10.6 ms and the worst window mean on record is 21.1 ms.

The `search_products` RPC is the one worth watching: a 46 ms mean with 66 ms stddev is the widest spread in the application set. It is the Postgres fallback that production uses because Meilisearch is off (`docs/` UX21 notes); it does not get faster until the engine is switched.

---

## 5. Performance Advisors (get_advisors type=performance)

| Advisor | Level | Count | Notes |
|---|---|---|---|
| auth_rls_initplan | WARN | 1 | `profiles.profiles_super_admin_mfa` re-evaluates `auth.<fn>()` per row. Wrap it in `(select ...)`. Candidate for the next migration batch in `migrations/pending/`. |
| multiple_permissive_policies | WARN | 14 | banners, cashback_ledger, homepage_sections, payment_events, payout_statement_lines, payout_statements, refunds, supplier_branches (4 actions), support_ticket_messages, support_tickets, whatsapp_contacts. Each pair is an owner policy plus a staff policy; Postgres evaluates both on every row. Correct but slower. |
| unindexed_foreign_keys | INFO | 9 | affiliate_attributions (3), affiliate_links, affiliate_payouts, auth_wa_otps, supplier_card_tokens (2), supplier_card_verifications. All low-row tables today. |
| unused_index | INFO | 156 | Down from 157: `idx_orders_user_status` recorded its first scan between 13:07 and 14:34 UTC and left the list. Largest remaining is `idx_audit_log_action` at 120 kB. Total waste is small; no action. |
| auth_db_connections_absolute | INFO | 1 | See section 1. |

None of these is a slow-query cause today. The two WARN rows are the only ones that scale with traffic, and both are policy shape, not data volume.

---

## 6. Storage

| Item | Value |
|---|---|
| Database size | 46 MB (unchanged since 13:07 UTC; 45 MB at 10:22 and 11:45 UTC; 44 MB from 21:24 UTC on 20.10 through 08:14 UTC on 21.10; 43 MB at 18:21 UTC) |
| Largest table | audit_log, 7,648 kB, 3,005 live rows (+139 since 13:07 UTC, the same step as the window before) |
| carts | 2,704 kB, 4,268 live rows (434 dead), autovacuum 2026-10-16; grows every pass (+46 live rows since 13:07 UTC, guest carts from the storefront) |
| analytics_events | 2,024 kB, 2,769 live rows (+84 since 13:07 UTC), autovacuum 2026-10-21 |
| products | 752 kB, 82 live rows, 37 dead rows, autovacuum 2026-10-21 (66 dead before it ran, 10 at 10:22 UTC, 19 at 11:45 UTC, 28 at 13:07 UTC) |
| rate_limits | 320 kB, 717 live rows, 176 dead, autovacuum 2026-10-15, autoanalyze 2026-10-21 13:45 UTC (section 4) |
| users | 264 kB, 14 live rows, 1 dead (50 dead at 13:07 UTC; autovacuum 2026-10-21 cleared them) |
| Replication slots | none (the application does not use Realtime; the `wal->>` poller rows in pg_stat_statements are historical platform traffic) |

---

## 7. Verification Checklist (2026-10-21 14:34 UTC)

- [x] Supabase MCP reached (official server over stdio, `--read-only`, 13 tools listed)
- [x] Pool measured from pg_stat_activity, not inferred from the plan tier
- [x] Pooler configuration re-read from the management API (unchanged since 16:24 UTC on 20.10; SHA-1 of the sorted JSON matches `logs/maint9/pooler.json` and `pgbouncer.json`)
- [x] pg_stat_statements queried for mean and max over 500 ms
- [x] Statements classified as application versus platform (`classifyStatement`, tested)
- [x] Performance advisors fetched
- [x] No application statement with mean over 500 ms
- [x] All seven max-over-500 application rows unmoved across thirteen passes from 16:24 UTC on 20.10 to 14:34 UTC on 21.10
- [x] Re-checked `check_rate_limit` through 02:51, 08:14, 10:22, 11:45, 13:07 and 14:34 UTC; max unmoved through 1,104 new calls, the 13:07 stddev movement did not repeat (22.85 to 22.75 ms on 156 calls, slowest possible call in the window about 220 ms), follow-up probe recorded, watch item held open for one more pass
- [x] The 9 new pg_stat_statements rows since 13:07 UTC attributed by `stats_since` to the twelfth pass's own follow-up probes (8) and one `cron.job` inspection from another session (1), none application traffic
- [x] `unused_index` advisor down from 157 to 156: `idx_orders_user_status` recorded its first scan, no index was dropped
- [x] Probe script under test: `scripts/db-mcp-probe.test.mjs` (10 tests, green this pass)
- [ ] `profiles_super_admin_mfa` initplan fix (next migration batch, needs approval like every migration)
- [ ] Re-run after Meilisearch is enabled in production to retire the `search_products` fallback row
- [ ] `log_min_duration_statement = 500` on production (management API config change, needs Ofir's approval) so the next `check_rate_limit` slow call is logged with its timestamp

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

**Report Status:** COMPLETE (measured 2026-10-21 14:34 UTC; thirteenth measured pass, all seven application spike maxima unmoved through 386 new application calls in the window, no application mean near 500 ms, no alert; the `check_rate_limit` watch item from 13:07 was quiet this window and stays open for one more pass, section 4)
**Next Review:** MAINTENANCE_LOOP cycle, or after any migration in the pending batch is applied
**Escalation:** none required
