# Database Status Report: Connection Pool and Query Performance

**Last Updated:** 2026-10-21 20:12 UTC (MAINTENANCE_LOOP_9 seventeenth measured pass, through the Supabase MCP)
**Previous Run:** 2026-10-21 18:42 UTC (sixteenth measured pass, `logs/maint9/result-16.json`. Before it: 17:19 UTC the fifteenth (`result-15.json`), 15:58 UTC the fourteenth (`result-14.json`), 14:34 UTC the thirteenth (`result-13.json`), 13:07 UTC the twelfth (`result-12.json`), 11:45 UTC the eleventh (`result-11.json`), 10:22 UTC the tenth (`result-10.json`), 08:14 UTC the ninth (`result-09.json`), 02:51 UTC the eighth (its header once said "10:00 UTC", the local wall clock; `result-08.json` carries the true `ts` of 02:51:00Z), 01:59 UTC the seventh, 01:53 UTC the sixth, 23:56 UTC the fifth, 22:45 UTC the fourth, 21:24 UTC the third, 18:21 UTC the second, 16:24 UTC the first, and the 13:23 UTC report before it was code analysis only)
**Scope:** Supabase connection pool, pooler configuration, pg_stat_statements, performance advisors
**Evidence:** `logs/maint9/result-17.json` (every probe row of this pass; `result-16.json` through `result-08.json` and `result.json` are the ten passes before it), `logs/maint9/pooler.json`, `logs/maint9/pgbouncer.json`, `logs/maint9/rate-limit-probe.json` (the 01:53 UTC follow-up on the `check_rate_limit` spike), `logs/maint9/rate-limit-probe-12.json` through `rate-limit-probe-16.json` (the 13:07, 14:34, 15:58, 17:19 and 18:42 UTC windows on that row), `logs/maint9/rate-limit-probe-17.json` (the 20:12 UTC window: the unrounded spike rows, the `stats_since` attribution of the new statements, the `release_expired_order_discounts` row, the `consume_order_stock` row and function body, the orders created in the window) and `logs/maint9/consume-order-stock-probe-17.json` (the shape probe on the new spike: `stock_reservations` and `products` indexes, the six triggers on `products` with their bodies, consumption timing per hour and per day, audit_log rows written in the window, the realtime message partitions)
**Probe:** `scripts/db-mcp-probe.mjs` (the official `@supabase/mcp-server-supabase` run locally in `--read-only` mode; see the header comment for the token recipe)

---

## Executive Summary

**Connection pool:** healthy. 14 of 60 backends in use (23.3%), 0 lock waits, 0 statements running longer than 500 ms at probe time, 0 deadlocks since the stats reset.
**Query performance:** no application statement averages over 500 ms. Six statements do average over 500 ms, and all six are Supabase platform traffic (dashboard, pg-meta introspection, this report's own probes). **Eight** application statements now have a recorded spike over 500 ms: the seven of every pass since 01:53 UTC, none of whose maxima moved, plus one new row this pass, the `consume_order_stock(p_order_id)` RPC that `finalizeOrder` calls once per paid order (`src/server/payments/finalize.ts`). It has 146 calls since 2026-09-10, a 161.8 ms mean (the highest application mean on the instance, three and a half times `search_products`), a 544.7 ms max, and the max crossed 500 ms inside this window. Section 4 has the shape: the time is trigger work on `products` (six row triggers, one of them a `realtime.send` into message partitions that stop at 2026-10-08 and have never received a row, one an audit copy of the whole product row three times over), not a missing index. A watch item is opened on it. The `check_rate_limit` watch item closed at 15:58 stays closed: 144 new calls at a 12.3 ms window mean, stddev up 0.11 ms (22.48 to 22.60, the first rise since 13:07), and the variance arithmetic bounds the slowest call in the window at 361 to 390 ms, under the line.
**Alert status:** no alert for application queries. No application mean is near 500 ms (the worst is now `consume_order_stock` at 161.8 ms), so nothing crosses the alert line this report uses (mean over 500 ms). One watch item is open (`consume_order_stock`, section 4).

What changed since the previous report (1 hour 30 minutes earlier, 18:42 to 20:12 UTC): one new application row over 500 ms by max, and no mean moved by more than 0.2 ms among the seven rows carried over. The pool is the same 14 of 60 backends, the same four clients, the same 13 idle on `ClientRead`. pg_stat_statements tracks 4,936 distinct statements (+4 since 18:42; `stats_since` dates three of them to 18:44 and 18:45 UTC, the sixteenth pass's own follow-up statements through the management API as `supabase_read_only_user`, and the fourth to 19:47 UTC, a one-call `cron.job` / `cron.job_run_details` status read by the `postgres` role; none over 48 ms, none application traffic) and grew by 29,704 calls and 22.7 s of execution time: carts UPDATE +10 calls, carts INSERT +48, `available_stock` +132, `check_rate_limit` +144, `fn_record_search` +24, the products select by slug +2, the `seo_redirects` lookup +118 and `consume_order_stock` +11; `search_products`, the `analytics_events` select and `release_expired_order_discounts` (re-read directly: still 365 calls, 90.9 ms mean, 173.6 ms max) had no calls in the window. The 6 platform rows over 500 ms by mean are unchanged, call for call. The seven carried-over application spike maxima are identical to the millisecond through 358 added calls; the means that moved are carts UPDATE (4.044 to 4.035 ms), `check_rate_limit` (10.532 to 10.554 ms), `available_stock` (5.441 to 5.468 ms), carts INSERT (5.494 to 5.527 ms) and `fn_record_search` (15.895 to 16.014 ms). Three stddevs rose, all by a tenth of a millisecond or less (`check_rate_limit` 22.4835 to 22.5960, `available_stock` 15.7001 to 15.7010, `fn_record_search` 21.2338 to 21.2839) and two fell (carts UPDATE 31.4526 to 31.3497, carts INSERT 17.3200 to 17.2835). The window held the hourly Playwright money-path run (`docs/E2E-STATUS.md`, run 19 at 19:35 UTC): 11 orders created between 19:09:37 and 19:39:05 UTC, each finalized against the production database, each consuming one stock reservation (19:09:49 to 19:39:16 UTC) and writing a 15-row audit chain, which is exactly the 171 rows `audit_log` grew by (3,422 to 3,593 live; 22 `wallet_accounts` updates, 13 `orders` updates and eleven each of eleven other entity and action pairs, plus 3 `voucher_redemptions` and 1 `vouchers` update). Temp files grew by 184 and every writer is the probe's own `pg_stat_statements` scan or pg-meta (no application statement writes temp). Advisor counts unchanged: 1 + 14 WARN, INFO 9 + 155 + 1, every finding identical to the 18:42 set once the nested `observed_at` stamps are ignored, and the top-15 `unused_index` rows are the same fifteen; `idx_invoices_order` is at 36 scans now (25 at 18:42). Database size 48 MB (unchanged); five tables were autovacuumed inside the window (audit_log 19:11:47 UTC with dead rows 66 to 0, products 19:12:46 with dead rows 64 to 8, orders 19:14:46, invoices 19:24:47 with dead rows 67 to 4, all first vacuums of the day for audit_log and invoices) and rate_limits was autoanalyzed at 19:09:46 UTC (live 748 to 761, dead 57 to 94); carts grew from 4,413 to 4,458 live (518 to 549 dead), vouchers from 123 to 134, notification_outbox from 434 to 468, refresh_tokens from 114 to 120, invoices from 137 to 148; analytics_events stayed at 2,769 live rows. The ten largest tables are the same ten in the same order. Pooler and pgbouncer configuration re-read from the management API and byte-identical to the stored copies (same SHA-1 of the sorted JSON).

Across the sixteen measured passes before this one (16:24, 18:21, 21:24, 22:45, 23:56, 01:53, 01:59, 02:51, 08:14, 10:22, 11:45, 13:07, 14:34, 15:58, 17:19 and 18:42 UTC) the application spike list was seven rows, and all seven maxima still stand: six have not moved by a single millisecond since 16:24 UTC, and the seventh (`check_rate_limit`) has not moved since it was first seen at 01:53 UTC, through 1,663 new calls at a 10.6 ms mean. The eighth row is the first new application max over 500 ms since that one. No alert, no fix made; one fix candidate is recorded in section 4 and section 7 for the pending migration batch.

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
| PostgREST 14.5 | authenticator | 11 | idle (persistent pool, oldest idle 54.2 days) |
| postgres_exporter | supabase_admin | 1 | idle |
| (none) | supabase_admin | 1 | idle |
| mgmt-api | supabase_read_only_user | 1 | active (this probe) |

Totals: 14 client backends of 60 (23.3%), `numbackends` 16 including platform workers. Lock waits: 0. Statements older than 500 ms still running: 0. Deadlocks: 0. Buffer cache hit: 100.00%. Every idle backend is waiting on `ClientRead` (`activity_wait_events` in `rate-limit-probe-17.json`), none on a lock or IO.

Transactions since the database stats were created: 8,847,611 commits and 649,319 rollbacks (6.8%); since the 18:42 UTC pass, 21,211 commits and 1,495 rollbacks. The rollback share is dominated by read-only wrappers that end in ROLLBACK by design (the MCP `--read-only` mode and the management-API rehearsals in `docs/RUNBOOK.md`), not by failed application writes.

### Auth server

The performance advisor `auth_db_connections_absolute` (INFO) reports the Auth server pinned at an absolute 10 connections. That is a platform setting; it matters only if the compute size is ever raised, because Auth would not scale with it.

---

## 2. Query Performance (pg_stat_statements 1.11, schema `extensions`)

Statistics window: since the reset on 2026-07-16 19:10 UTC (97 days).

| Metric | Value |
|---|---|
| Distinct statements tracked | 4,936 (+4 since 18:42 UTC: three from the sixteenth pass's own follow-up probes, one `cron.job` status read at 19:47 UTC, dated by `stats_since`) |
| Total calls | 7,734,918 (+29,704 since 18:42 UTC) |
| Total execution time | 3,179,842 ms (53.0 minutes over 97 days) |
| Statements with mean over 500 ms | 6 (0 application) |
| Statements with max over 500 ms | 21 (8 application, 13 platform) |
| Temp files written (pg_stat_database) | 167,905 (+184 since 18:42 UTC; every writer in `temp_spill` is this probe's own pg_stat_statements scan or pg-meta, no application statement) |

### Application statements by total time

| Calls | Mean ms | Total ms | Statement |
|---|---|---|---|
| 45,790 | 4.0 | 182,025 | `seo_redirects` lookup by source_path (proxy redirect check) |
| 11,412 | 10.6 | 120,440 | rpc `check_rate_limit(p_key, p_max_attempts, p_window_seconds)` (`src/lib/utils/rate-limit.ts`) |
| 21,950 | 5.5 | 120,014 | rpc `available_stock(p_product_id)` (`src/lib/commerce/stock-live.ts`) |
| 887 | 46.3 | 41,108 | rpc `search_products(q, max_results)` |
| 7,046 | 5.5 | 38,941 | `carts` INSERT |
| 163,585 | 0.2 | 36,809 | `products` select by slug |
| 2,253 | 16.0 | 36,079 | rpc `fn_record_search` (`src/lib/search/record.ts`) |
| 2,055 | 16.4 | 33,789 | `analytics_events` select by event_name and occurred_at |
| 365 | 90.9 | 33,196 | rpc `release_expired_order_discounts` (cron; outside the probe's top 15, row re-read directly at 20:15 UTC, unchanged since 13:07) |
| 146 | 161.8 | 23,627 | rpc `consume_order_stock(p_order_id)` (`src/server/payments/finalize.ts`; outside the probe's top 15, row read directly at 20:15 UTC, section 4) |

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
| 1,523 | 4.0 | 1,159.2 | 31.3 | `carts` UPDATE (expires_at, items) |
| 11,412 | 10.6 | 1,137.4 | 22.6 | rpc `check_rate_limit` (`src/lib/utils/rate-limit.ts`) |
| 21,950 | 5.5 | 1,013.8 | 15.7 | rpc `available_stock` |
| 7,046 | 5.5 | 883.6 | 17.3 | `carts` INSERT |
| 887 | 46.3 | 857.1 | 66.0 | rpc `search_products` |
| 146 | 161.8 | 544.7 | 89.0 | rpc `consume_order_stock` (`src/server/payments/finalize.ts`), **new this pass** |
| 2,253 | 16.0 | 525.3 | 21.3 | rpc `fn_record_search` (`src/lib/search/record.ts`) |
| 2,055 | 16.4 | 515.6 | 34.9 | `analytics_events` select |

The seven carried-over rows have means under 50 ms and standard deviations an order of magnitude below the max in a 97-day window. The shape matches cold cache after a compute pause or a plan re-prepare, not a missing index: `carts` has 125,059 index scans against 60 sequential scans, and `analytics_events` 4,839 against 24. All seven max values held across the 16:24, 18:21, 21:24, 22:45, 23:56, 01:53, 01:59, 02:51, 08:14, 10:22, 11:45, 13:07, 14:34, 15:58, 17:19, 18:42 and 20:12 UTC runs while cumulative call counts grew (358 new application calls across the seven rows in the 18:42 to 20:12 window, on top of 359 in the window before). Every carried-over row moved by at most 0.2 ms in mean and 0.12 ms in stddev; the sum-of-squares arithmetic bounds the slowest call in the window at 10 ms for carts UPDATE (10 calls), 209 ms for `available_stock` (132 calls; 176 ms with the other 131 at the 9.8 ms window mean), 98 ms for carts INSERT (48 calls; 67 ms), 174 ms for `fn_record_search` (24 calls at a 27.1 ms window mean; 116 ms) and 390 ms for `check_rate_limit` (next subsection). The eighth row is new and has its own subsection below. No alert; one watch item open.

### The `consume_order_stock` spike (first seen 20:12 UTC, watch item opened)

**What the row is.** `WITH pgrst_source AS (... "public"."consume_order_stock"("p_order_id" := ...) ...)`, issued by PostgREST as `service_role`: 146 calls since its `stats_since` of 2026-09-10 09:37 UTC, 146 rows returned, 23,627.3 ms total, min 20.61 ms, mean 161.831 ms, max 544.7 ms, stddev 88.9509 ms, `shared_blks_read` 0 (82,529 hits, 565 per call), 2,258 blocks dirtied and 5,943 WAL records (15.5 and 40.7 per call), no temp. The caller is `finalizeOrder` in `src/server/payments/finalize.ts` (line 623), once per order that becomes paid, through the admin client; its failure is logged and deliberately does not fail the finalize. It was not in the 18:42 UTC list, so its max was at or under 500 ms then and the 544.7 ms call happened in this window.

**When the calls happen.** `stock_reservations.consumed_at` (the column the function sets) dates every call: 1 on 2026-09-10, 18 on 09-21, 3 on 09-25, 4 on 10-05, 44 on 10-15 and 76 today. Today's calls come 9 to 11 per hour at 09, 10, 12, 13, 15, 16, 17 and 19 UTC, and the 11 in this window ran from 19:09:49 to 19:39:16 UTC, one per order created between 19:09:37 and 19:39:05. That is the hourly Playwright money-path run (`docs/E2E-STATUS.md`, run 19 at 19:35 UTC under MAINTENANCE_LOOP_4), whose mock-Cardcom build finalizes real orders against the production database. The row entered the spike list today because that run now exercises it every hour, not because the function changed (its one `CREATE OR REPLACE` row is dated 2026-08-10).

**Where the time goes.** Not the reservation claim: `stock_reservations` has 179 live rows (146 consumed, 17 released, 16 open) and the claim `UPDATE ... WHERE order_id = $1 AND consumed_at IS NULL AND released_at IS NULL` is served by `stock_reservations_order_line_idx`, a unique index whose leading column is `order_id` (290 scans; the table's 30,120 sequential scans belong to the expiry sweeper, and at 179 rows a sequential scan is sub-millisecond either way). Not the products update as such: `products` has 82 rows and the update is by primary key. The cost is what fires on that update. `products` carries six row triggers (`consume-order-stock-probe-17.json`, `trigger_schemas` and `trigger_defs`):

- `set_updated_at` (BEFORE), trivial.
- `enforce_product_approval` (BEFORE), returns on its first line for the service role because `auth.uid()` is null.
- `products_track_stock_initial` (BEFORE), two comparisons.
- `audit_products` (AFTER): `audit_log_trigger_fn` serialises the old and new product row with `to_jsonb`, strips six redacted keys from each, and inserts `changes` (old and new), `before` and `after`, three copies of a row that averages 2,699 bytes and reaches 13 kB in `audit_log`, into a table with six indexes. The window's 11 product updates are 11 of the 171 audit rows written.
- `products_enqueue_search_index` (AFTER): one insert into `search_index_outbox`, which holds 239 live rows (312 inserted all time) with nothing draining it while production Meilisearch is off.
- `products_broadcast_live` (AFTER UPDATE OF stock_quantity, ...): calls `public.available_stock(NEW.id, NULL, NULL)` (the 5.5 ms RPC in the table above) and then `realtime.send(...)` inside an `EXCEPTION WHEN OTHERS` block that downgrades any failure to a `RAISE WARNING`. The `realtime.messages` table has daily partitions only for 2026-10-02 through 2026-10-08, every partition has `n_tup_ins` 0, and `realtime.subscription` has 0 live rows (the application does not use Realtime). A row dated today has no partition to land in, so on the evidence here the send fails on every call and is rolled back through the handler's subtransaction. That is a cost with no consumer; it cannot be confirmed from this role without the Postgres log, where the warning would appear.

On top of the triggers, `products` has 29 indexes on 82 rows and 96% of its updates are non-HOT (32 HOT of 862), so every stock decrement writes a new index entry in each of the 29; that is the 15.5 dirtied blocks and 40.7 WAL records per call. Per-call attribution is not possible from this instance (`track_functions = none`, `pg_stat_statements.track = top`, `log_min_duration_statement = -1`), and the read-only role cannot `EXPLAIN` an `UPDATE` on either table (42501, recorded in the shape probe). The 544.7 ms max fits one of the 11 window calls landing on the same page as the concurrent E2E writers (orders, payments, invoices, vouchers, wallet entries, all written in the same seconds) or on an autovacuum: `products` itself was autovacuumed at 19:12:46 UTC, inside the burst.

**Why no alert and what would close it.** The mean is 161.8 ms, under the 500 ms line, and the max is 544.7 ms, nine percent over it, once in 146 calls. The watch item closes when two consecutive windows that contain the hourly E2E burst add calls without moving the max; it is escalated to an alert if the mean crosses 500 ms or a second max over 500 ms appears. The fix candidates are all pending-migration work, listed in section 7 and not made by this pass: drop or no-op `products_broadcast_live` (no subscriber exists and the partitions are gone), stop `audit_log_trigger_fn` storing the row three times, and prune the 29 indexes on `products` (24 of them have under 3,000 scans in 97 days; the `unused_index` advisor already lists several).

### The `check_rate_limit` spike (first seen 01:53 UTC; max unmoved through 20:12 UTC, variance moved at 13:07 UTC, quiet at 14:34, 15:58, 17:19 and 18:42 UTC, a 0.11 ms rise at 20:12 UTC, watch item closed)

**20:12 UTC window (18:42 to 20:12, `logs/maint9/rate-limit-probe-17.json`).** 144 new calls and 1,767.7 ms of new execution (`total_exec_time` 118,672.1 to 120,439.8 ms), a 12.3 ms mean inside the window against 8.8 ms in the window before and 10.6 ms lifetime. Max unchanged at 1,137.4 ms; stddev up from 22.4835 to 22.5960 ms (unrounded in both follow-up files), the first rise since 13:07 and a thirtieth of that one (+0.11 against +3.35). Sum of squares from `calls × (stddev² + mean²)`: 7,097,877 ms² now against 6,945,942 ms² at 18:42 (three-decimal means in both), so the 144 new calls contributed about 151,900 ms². The square root of that delta, 390 ms, is the hardest upper bound on any single call in the window; with the other 143 calls at the window mean it is 361 ms. Either way no call reached 500 ms, so the closing rule holds and the watch item stays closed. The extra calls and the rise have the same source as everything else in this window: the hourly E2E run logs in and checks out through the rate limiter (144 calls against 135 in each of the three windows before). `rate_limits` was autoanalyzed inside this window at 19:09:46 UTC (`autoanalyze_count` 192 to 193, `n_live_tup` 748 to 761, dead rows 57 to 94, `last_autovacuum` still 16:24:38 UTC), 13 seconds after the first E2E order; counting a 0.11 ms stddev rise as a movement, the autoanalyze correlation is three for seven across today's windows that held one (01:53, 13:07 and 20:12 moved; 14:34, 15:58, 17:19 and 18:42 did not), and two for seven if it is not. `shared_blks_read` stays at 0 across all 11,412 calls (1,204,534 hits), `rate_limits_key_key` carries 14,773 of 14,780 index scans, `pg_stat_user_functions` is still empty, and the four attribution settings are unchanged (`track_functions = none`, `track_io_timing = off`, `log_min_duration_statement = -1`, `pg_stat_statements.track = top`).

**18:42 UTC window (17:19 to 18:42, `logs/maint9/rate-limit-probe-16.json`).** 135 new calls and 1,191.7 ms of new execution (`total_exec_time` 117,480.4 to 118,672.1 ms), an 8.8 ms mean inside the window against 7.5 ms in the window before and 10.5 ms lifetime. Max unchanged at 1,137.4 ms; stddev down from 22.5660 to 22.4835 ms (unrounded in both follow-up files). Sum of squares from `calls × (stddev² + mean²)`: 6,945,468 ms² now against 6,908,325 ms² at 17:19 (two-decimal means; 6,945,942 against 6,908,795 from the three-decimal means), so the 135 new calls contributed about 37,150 ms². The square root of that delta, 193 ms, is the hardest upper bound on any single call in the window, under two fifths of the 500 ms line. `rate_limits` was autoanalyzed inside this window at 17:46:42 UTC (`autoanalyze_count` 191 to 192, `n_live_tup` 738 to 748, dead rows 20 to 57, `last_autovacuum` still 16:24:38 UTC) and produced no slow call. Fourth quiet window in a row.

**17:19 UTC window (15:58 to 17:19, `logs/maint9/rate-limit-probe-15.json`).** 135 new calls and 1,008.6 ms of new execution (`total_exec_time` 116,471.8 to 117,480.4 ms), a 7.5 ms mean inside the window against 9.9 ms in the window before and 10.6 ms lifetime: the quietest window since the row was first seen. Max unchanged at 1,137.4 ms; stddev down from 22.6710 to 22.5660 ms (unrounded in both follow-up files). Sum of squares from `calls × (stddev² + mean²)`: 6,908,325 ms² now against 6,886,094 ms² at 15:58 (both from the two-decimal means in the follow-up files; the 15:58 report quoted 6,886,157 from a differently rounded mean), so the 135 new calls contributed about 22,200 ms² (22,700 from the three-decimal means). The square root of that delta, about 150 ms, is the hardest upper bound on any single call in the window, under a third of the 500 ms line. Two autovacuum events sat inside this window: `rate_limits` was autovacuumed at 16:24:38 UTC (`autovacuum_count` 91 to 92, its first vacuum since 2026-10-15, `n_dead_tup` 192 to 20) and autoanalyzed at 16:26:38 UTC (`autoanalyze_count` 190 to 191, `n_live_tup` 729 to 738), and neither produced a slow call.

**15:58 UTC window (14:34 to 15:58, `logs/maint9/rate-limit-probe-14.json`).** 145 new calls and 1,442.0 ms of new execution (`total_exec_time` 115,029.8 to 116,471.8 ms), a 9.9 ms mean inside the window against 10.9 ms in the window before and 10.6 ms lifetime. Max unchanged at 1,137.4 ms; stddev down from 22.7485 to 22.6710 ms (unrounded in both follow-up files). Sum of squares from `calls × (stddev² + mean²)`: 6,886,157 ms² now against 6,835,554 ms² at 14:34, so the 145 new calls contributed 50,603 ms². The square root of that delta, 225 ms, is the hardest upper bound on any single call in the window, so again nothing came within a factor of two of 500 ms. `rate_limits` was autoanalyzed inside this window too, at 15:05:34 UTC (`autoanalyze_count` 189 to 190, `n_live_tup` 717 to 729, 176 to 192 dead, `last_autovacuum` still 2026-10-15), and again it produced no slow call. This was the second quiet window in a row, which is the closing condition the 14:34 pass set, so the watch item was closed: the row reads as a historical spike (one max at 1,137.4 ms, one sub-max window at 13:07) with no recurring slow path. The `log_min_duration_statement = 500` item in section 7 stays listed as the only way a future recurrence would get a timestamp.

**14:34 UTC window (13:07 to 14:34, `logs/maint9/rate-limit-probe-13.json`).** 156 new calls and 1,696.3 ms of new execution (`total_exec_time` 113,333.5 to 115,029.8 ms), a 10.9 ms mean inside the window against 21.1 ms in the window before and 10.6 ms lifetime. Max unchanged at 1,137.4 ms; stddev down from 22.85 to 22.75 ms (unrounded in both follow-up files). Sum of squares from `calls × (stddev² + mean²)`: 6,835,554 ms² now against 6,785,900 ms² at 13:07, so the 156 new calls contributed 49,654 ms². The square root of that delta, 223 ms, is the hardest upper bound on any single call in the window (it would require the other 155 to take zero time), so nothing in this window came within a factor of two of 500 ms. `rate_limits` was autoanalyzed inside this window as well, at 13:45:31 UTC (`autoanalyze_count` 188 to 189, `n_live_tup` 702 to 717, 164 to 176 dead, `last_autovacuum` still 2026-10-15), and it produced no slow call. `shared_blks_read` stayed at 0 across all 10,853 calls, `rate_limits_key_key` carried 14,214 of 14,221 index scans, `pg_stat_user_functions` was still empty (`track_functions = none`), `log_min_duration_statement` still -1 and `pg_stat_statements.track` still `top`, so per-call attribution remained impossible from this instance. The 14:34 pass left the watch item open for one more pass, with two quiet windows in a row as the closing condition; the 15:58 window above met it.

**13:07 UTC window (11:45 to 13:07).** 135 new calls and 2,847.5 ms of new execution (`total_exec_time` 110,486 to 113,333.5 ms), a 21.1 ms mean inside the window against 12.4 ms in the window before and 10.6 ms lifetime. The max did not move (1,137.4 ms), but the population stddev rose from 19.5 to 22.85 ms. Sum of squares from `calls × (stddev² + mean²)`: 6.78 M ms² now against 5.15 to 5.21 M ms² at 11:45 (the 11:45 values are rounded to 0.1 ms, hence the band), so the 135 new calls contributed 1.57 to 1.64 M ms². A single call cannot do that under the unchanged max (1,137.4² = 1.29 M ms²), so the window held at least two calls over roughly 450 ms, and the standing max bounds every one of them. With 133 ordinary calls at the lifetime 8 to 10 ms, the arithmetic fits two calls near 870 ms, or one near 1,100 ms plus one near 550 ms. This is the first evidence of a slow call in this row since the 1,137.4 ms max was recorded, and it is a sub-max recurrence, not a new max.

What the 13:07 follow-up (`logs/maint9/rate-limit-probe-12.json`) rules in and out:

- `rate_limits` was autoanalyzed at 12:20:27 UTC, inside the window (`autoanalyze_count` 188, `last_autovacuum` still 2026-10-15). The 01:53 follow-up named an autoanalyze at 00:53:54 UTC, just before that spike window. Two for two, which made plan invalidation after analyze (PostgREST re-prepares its statement and the plpgsql function re-plans its cached statements) the leading candidate. It is a correlation, not a measurement; an analyze of a 312 kB table takes milliseconds and the lock it takes does not block the `INSERT ... ON CONFLICT`.
- Not disk: the row has `shared_blks_read` 0 across all 10,697 calls (1,180,055 hits), so no call in this window or any earlier one waited on a block read.
- Not bloat and not a missing index: 702 live rows, 164 dead (under the 190-row autovacuum threshold), 78% of updates are HOT, and the `UNIQUE (key)` index carries 14,058 of 14,065 index scans. `rate_limits_key_idx` still exists (2 scans); the 26 `DROP INDEX IF EXISTS` calls in pg_stat_statements are rolled-back rehearsals of the pending migration that removes it.
- Not now: at probe time all 13 idle backends were on `ClientRead`, 0 lock waits, 0 statements running over 500 ms.
- Cannot be attributed per call from this instance: `track_functions = none`, `track_io_timing = off`, `log_min_duration_statement = -1` and `pg_stat_statements.track = top`, so the nested statement inside the function is not tracked and no slow-statement log line exists. Turning on `log_min_duration_statement = 500` would show the next one with its exact timestamp and parameters; that is a production Postgres config change through the management API and is left for Ofir to approve, not made by this pass.

What the 13:07 pass asked the next pass to check: a third movement after another autoanalyze would have confirmed the mechanism, a return to a 10 to 12 ms window mean with the stddev flat would leave it at two isolated windows in a day. The 14:34 window delivered the second outcome (10.9 ms window mean, stddev down 0.1 ms) with an autoanalyze inside it, which also weakened the mechanism half of the first outcome.

**Earlier history (23:56 UTC on 20.10 to 11:45 UTC on 21.10).**

At 23:56 UTC the rate limiter RPC had 9,501 calls, 100,610 ms total and a max under 500 ms (it was absent from the max-over-500 list). At 01:53 UTC it had 9,749 calls, 103,501 ms total and a max of 1,137.4 ms (248 new calls and 2,891 ms in the 117-minute window). At 01:59 UTC it still had 9,749 calls and a max of 1,137.4 ms (zero new calls in the 6-minute window). At 02:51 UTC it had 9,858 calls, at 08:14 UTC 10,232 calls (374 new calls in 5 hours 23 minutes, 2,393 ms of execution, a 6.4 ms mean inside the window, stddev down from 19.3 to 18.9 ms) at 10:22 UTC 10,428 calls (196 new calls in 2 hours 8 minutes, 2,209 ms of execution, an 11.3 ms mean inside the window, stddev 19.4 ms) and at 11:45 UTC 10,562 calls (134 new calls in 1 hour 23 minutes, 1,659 ms of execution, a 12.4 ms mean inside the window, stddev 19.5 ms), still with the same 1,137.4 ms max. Through those 813 calls the max did not move and neither did the stddev beyond 0.1 ms, so until 13:07 UTC it read as a historical spike with no recurring slow path. Candidates from the 01:53 follow-up probe (`logs/maint9/rate-limit-probe.json`) were an autoanalyze of the 288 kB `rate_limits` table (00:53:54 UTC, just before the spike window) and concurrent lock contention on the single-row `INSERT ... ON CONFLICT` that implements the rate limit. Call density remains low (11,412 total calls over 51 days since the row's `stats_since` of 2026-08-31, about 220 per day). No alert: the lifetime mean is 10.6 ms and the worst window mean on record is 21.1 ms.

The `search_products` RPC is still worth watching: a 46 ms mean with 66 ms stddev is the widest spread in the application set after the new row. It is the Postgres fallback that production uses because Meilisearch is off (`docs/` UX21 notes); it does not get faster until the engine is switched.

---

## 5. Performance Advisors (get_advisors type=performance)

| Advisor | Level | Count | Notes |
|---|---|---|---|
| auth_rls_initplan | WARN | 1 | `profiles.profiles_super_admin_mfa` re-evaluates `auth.<fn>()` per row. Wrap it in `(select ...)`. Candidate for the next migration batch in `migrations/pending/`. |
| multiple_permissive_policies | WARN | 14 | banners, cashback_ledger, homepage_sections, payment_events, payout_statement_lines, payout_statements, refunds, supplier_branches (4 actions), support_ticket_messages, support_tickets, whatsapp_contacts. Each pair is an owner policy plus a staff policy; Postgres evaluates both on every row. Correct but slower. |
| unindexed_foreign_keys | INFO | 9 | affiliate_attributions (3), affiliate_links, affiliate_payouts, auth_wa_otps, supplier_card_tokens (2), supplier_card_verifications. All low-row tables today. |
| unused_index | INFO | 155 | Unchanged since 15:58 UTC (every finding identical to the 18:42 set once the nested `observed_at` is ignored), and the top-15 rows by size are the same fifteen. `idx_invoices_order`, which left the list between 14:34 and 15:58 UTC, is at 36 scans now (25 at 18:42). Largest remaining is `idx_audit_log_action` at 176 kB. Total waste is small; no action on its own, but section 4 notes that `products` carries 29 indexes on 82 rows and pays for all of them on every stock decrement. |
| auth_db_connections_absolute | INFO | 1 | See section 1. |

None of these is a slow-query cause today. The two WARN rows are the only ones that scale with traffic, and both are policy shape, not data volume.

---

## 6. Storage

| Item | Value |
|---|---|
| Database size | 48 MB (unchanged since 18:42 UTC; 47 MB at 15:58 and 17:19 UTC; 46 MB at 13:07 and 14:34 UTC; 45 MB at 10:22 and 11:45 UTC; 44 MB from 21:24 UTC on 20.10 through 08:14 UTC on 21.10; 43 MB at 18:21 UTC) |
| Largest table | audit_log, 9,128 kB, 3,593 live rows (+171 since 18:42 UTC, the E2E run's full order chain; 0 dead after its first autovacuum of the day at 19:11:47 UTC, autoanalyze 19:24:47 UTC) |
| carts | 2,888 kB, 4,458 live rows (549 dead), autovacuum 2026-10-16, autoanalyze 2026-10-21 16:29 UTC; grows every pass (+45 live rows since 18:42 UTC, guest carts from the storefront) |
| analytics_events | 2,024 kB, 2,769 live rows (unchanged since 14:34 UTC), autovacuum 2026-10-21 |
| products | 752 kB, 82 live rows, 8 dead rows (64 at 18:42 UTC), autovacuum 2026-10-21 19:12 UTC (tenth of the day, inside the E2E burst), autoanalyze 2026-10-21 17:47 UTC |
| rate_limits | 336 kB, 761 live rows, 94 dead (57 at 18:42 UTC), autovacuum 2026-10-21 16:24 UTC, autoanalyze 2026-10-21 19:09 UTC (section 4) |
| invoices | 296 kB, 148 live rows, 4 dead (67 at 18:42 UTC), autovacuum 2026-10-21 19:24 UTC; tenth largest, `users` (14 live, 16 dead, autoanalyze 19:39 UTC) stays below it |
| orders / order_items / stock_reservations | 181 / 217 / 179 live rows (orders autovacuumed 19:14 UTC); the three tables `consume_order_stock` and the E2E run touch, all small |
| search_index_outbox | 160 kB, 239 live rows, 312 inserted all time, no consumer while Meilisearch is off (section 4) |
| Replication slots | none (the application does not use Realtime; the `wal->>` poller rows in pg_stat_statements are historical platform traffic, `realtime.subscription` has 0 live rows and the `realtime.messages` partitions end at 2026-10-08 with 0 inserts) |

---

## 7. Verification Checklist (2026-10-21 20:12 UTC)

- [x] Supabase MCP reached (official server over stdio, `--read-only`, 13 tools listed)
- [x] Pool measured from pg_stat_activity, not inferred from the plan tier
- [x] Pooler configuration re-read from the management API (unchanged since 16:24 UTC on 20.10; SHA-1 of the sorted JSON matches `logs/maint9/pooler.json` and `pgbouncer.json`)
- [x] pg_stat_statements queried for mean and max over 500 ms
- [x] Statements classified as application versus platform (`classifyStatement`, tested)
- [x] Performance advisors fetched
- [x] No application statement with mean over 500 ms
- [x] All seven carried-over max-over-500 application rows unmoved across seventeen passes from 16:24 UTC on 20.10 to 20:12 UTC on 21.10
- [x] The eighth application row (`consume_order_stock`, max 544.7 ms, mean 161.8 ms) read unrounded, dated through `stock_reservations.consumed_at`, tied to the hourly E2E run, and its cost attributed to the six `products` triggers and 29 indexes rather than to a missing index; watch item opened (section 4)
- [x] Re-checked `check_rate_limit` through 02:51, 08:14, 10:22, 11:45, 13:07, 14:34, 15:58, 17:19, 18:42 and 20:12 UTC; max unmoved through 1,663 new calls, stddev up 0.11 ms on 144 calls at a 12.3 ms window mean, slowest possible call in the window 361 to 390 ms, through another autoanalyze of `rate_limits`, follow-up probe recorded, watch item stays closed
- [x] The 4 new pg_stat_statements rows since 18:42 UTC attributed by `stats_since` to the sixteenth pass's own follow-up probes (3) and one `cron.job` status read at 19:47 UTC, none application traffic
- [x] `unused_index` advisor unchanged at 155, every finding identical ignoring `observed_at`, top-15 list identical, no index was dropped
- [x] Probe script under test: `scripts/db-mcp-probe.test.mjs` (10 tests, green this pass)
- [ ] `consume_order_stock` watch item: close after two consecutive windows that contain the hourly E2E burst without a new max over 544.7 ms; alert if the mean crosses 500 ms or a second max over 500 ms appears
- [ ] Fix candidates for the pending migration batch (need approval like every migration): drop or no-op `products_broadcast_live` (no Realtime subscriber, message partitions end 2026-10-08), stop `audit_log_trigger_fn` storing `changes` as well as `before` and `after`, prune the 29 indexes on `products`
- [ ] `profiles_super_admin_mfa` initplan fix (next migration batch, needs approval like every migration)
- [ ] Re-run after Meilisearch is enabled in production to retire the `search_products` fallback row and drain `search_index_outbox`
- [ ] `log_min_duration_statement = 500` on production (management API config change, needs Ofir's approval) so any future `check_rate_limit` or `consume_order_stock` slow call is logged with its timestamp and the `products_broadcast_live` warning, if it fires, becomes visible

---

## 8. How to Re-run

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d) \
  node scripts/db-mcp-probe.mjs > logs/maint9/result.json
```

The script prints a one-line summary on stderr (`pool 14/60 (23.3%), statements over 500ms by mean: 6 (app: 0), app spikes: 8`) and writes the full JSON on stdout. `summary.alert` is true only when an application statement averages over 500 ms.

Reading the raw numbers afterwards:

```bash
node -e 'const r=require("./logs/maint9/result.json"); console.log(JSON.stringify(r.summary,null,1))'
```

---

**Report Status:** COMPLETE (measured 2026-10-21 20:12 UTC; seventeenth measured pass, all seven carried-over application spike maxima unmoved through 358 new application calls in the window, one new application spike row (`consume_order_stock`, 544.7 ms max, 161.8 ms mean, trigger cost on `products`, watch item opened), no application mean near 500 ms, no alert; the `check_rate_limit` watch item closed at 15:58 stays closed, slowest possible call 361 to 390 ms, section 4)
**Next Review:** MAINTENANCE_LOOP cycle, or after any migration in the pending batch is applied
**Escalation:** none required
