# Database Status Report: Connection Pool and Query Performance

**Last Updated:** 2026-10-21 21:43 UTC (MAINTENANCE_LOOP_9 eighteenth measured pass, through the Supabase MCP)
**Previous Run:** 2026-10-21 20:12 UTC (seventeenth measured pass, `logs/maint9/result-17.json`. Before it: 18:42 UTC the sixteenth (`result-16.json`), 17:19 UTC the fifteenth (`result-15.json`), 15:58 UTC the fourteenth (`result-14.json`), 14:34 UTC the thirteenth (`result-13.json`), 13:07 UTC the twelfth (`result-12.json`), 11:45 UTC the eleventh (`result-11.json`), 10:22 UTC the tenth (`result-10.json`), 08:14 UTC the ninth (`result-09.json`), 02:51 UTC the eighth (its header once said "10:00 UTC", the local wall clock; `result-08.json` carries the true `ts` of 02:51:00Z), 01:59 UTC the seventh, 01:53 UTC the sixth, 23:56 UTC the fifth, 22:45 UTC the fourth, 21:24 UTC the third, 18:21 UTC the second, 16:24 UTC the first, and the 13:23 UTC report before it was code analysis only)
**Scope:** Supabase connection pool, pooler configuration, pg_stat_statements, performance advisors
**Evidence:** `logs/maint9/result-18.json` (every probe row of this pass; `result-17.json` through `result-08.json` and `result.json` are the eleven passes before it), `logs/maint9/pooler.json`, `logs/maint9/pgbouncer.json`, `logs/maint9/rate-limit-probe.json` (the 01:53 UTC follow-up on the `check_rate_limit` spike), `logs/maint9/rate-limit-probe-12.json` through `rate-limit-probe-16.json` (the 13:07, 14:34, 15:58, 17:19 and 18:42 UTC windows on that row), `logs/maint9/rate-limit-probe-17.json` (the 20:12 UTC window), `logs/maint9/rate-limit-probe-18.json` (the 21:43 UTC window, two read-only MCP runs merged: the unrounded spike rows, the `check_rate_limit` and `consume_order_stock` rows with their block and WAL counters, the `stats_since` attribution of the 26 new statements, the orders, reservations and audit rows written in the window, the tables autoanalyzed inside it, the realtime partitions and `search_index_outbox` count) and `logs/maint9/consume-order-stock-probe-17.json` (the shape probe on the new spike: `stock_reservations` and `products` indexes, the six triggers on `products` with their bodies, consumption timing per hour and per day, audit_log rows written in the window, the realtime message partitions)
**Probe:** `scripts/db-mcp-probe.mjs` (the official `@supabase/mcp-server-supabase` run locally in `--read-only` mode; see the header comment for the token recipe)

---

## Executive Summary

**Connection pool:** healthy. 14 of 60 backends in use (23.3%), 0 lock waits, 0 statements running longer than 500 ms at probe time, 0 deadlocks since the stats reset.
**Query performance:** no application statement averages over 500 ms. Six statements do average over 500 ms, and all six are Supabase platform traffic (dashboard, pg-meta introspection, this report's own probes). Eight application statements have a recorded spike over 500 ms, the same eight as the 20:12 UTC pass, and **none of the eight maxima moved** in this window. The `consume_order_stock(p_order_id)` watch item opened at 20:12 (the RPC `finalizeOrder` calls once per paid order, `src/server/payments/finalize.ts`) had its first closing-rule window: the hourly E2E burst was present (9 calls, 20:47 to 21:04 UTC, one per order of `docs/E2E-STATUS.md` run 20), the max stayed at 544.7 ms to the microsecond (544.681965), and the mean rose from 161.8 to 164.5 ms on a 208.2 ms window mean (section 4). One of its two closing windows is met; it stays open. The `check_rate_limit` watch item closed at 15:58 stays closed: 133 new calls at a 9.9 ms window mean, stddev down 0.09 ms (22.60 to 22.50), and the variance arithmetic bounds the slowest call in the window at 136 to 177 ms, through two more autoanalyzes of `rate_limits`.
**Alert status:** no alert for application queries. No application mean is near 500 ms (the worst is `consume_order_stock` at 164.5 ms), so nothing crosses the alert line this report uses (mean over 500 ms). One watch item is open (`consume_order_stock`, section 4), with one of its two closing windows met.

What changed since the previous report (1 hour 31 minutes earlier, 20:12 to 21:43 UTC): nothing in the spike list. The eight application maxima are identical to the microsecond (re-read unrounded in `rate-limit-probe-18.json`), the 6 platform rows over 500 ms by mean are unchanged call for call, and so are the 13 platform rows over 500 ms by max. The pool is the same 14 of 60 backends, the same four clients, the same 13 idle on `ClientRead`. pg_stat_statements tracks 4,962 distinct statements (+26 since 20:12; `stats_since` dates 25 of them to 20:15 through 20:18 UTC, the seventeenth pass's own three follow-up runs as `supabase_read_only_user`, none over 458.8 ms, and the 26th to 21:16:41 UTC, a one-call 2.6 ms `cron.job` / `cron.job_run_details` status read by the `postgres` role; zero new application statements) and grew by 28,395 calls and 18.8 s of execution time: carts UPDATE +9 calls, carts INSERT +46, `available_stock` +129, `check_rate_limit` +133, `fn_record_search` +24, the products select by slug +6, the `seo_redirects` lookup +108 and `consume_order_stock` +9; `search_products`, the `analytics_events` select and `release_expired_order_discounts` (re-read directly: still 365 calls, 90.9 ms mean, 173.6 ms max) had no calls in the window. Means that moved among the carried-over rows: carts UPDATE 4.035 to 4.030 ms, `check_rate_limit` 10.554 to 10.546, `available_stock` 5.468 to 5.485, carts INSERT 5.527 to 5.546, `fn_record_search` 16.014 to 16.092, all by under 0.1 ms. Five stddevs fell (carts UPDATE 31.3497 to 31.2577, `check_rate_limit` 22.5960 to 22.5013, `available_stock` 15.7010 to 15.6825, carts INSERT 17.2835 to 17.2343, `fn_record_search` 21.2839 to 21.2493) and one rose, `consume_order_stock` 88.9509 to 90.8788 on its 9 window calls at a 208.2 ms window mean (section 4). The window held the hourly Playwright money-path run (`docs/E2E-STATUS.md`, run 20, the MAINTENANCE_LOOP_4 session of 20:40 to 21:25 UTC): 9 orders created between 20:47:13 and 21:04:39 UTC, all paid, each finalized against the production database, each consuming one stock reservation (`consumed_at` 20:47:27 to 21:04:49 UTC) and writing a 15-row audit chain, which is exactly the 139 rows `audit_log` grew by (3,593 to 3,732 live; 18 `wallet_accounts` updates, nine each of thirteen other entity and action pairs, plus 3 `voucher_redemptions` and 1 `vouchers` update, first row 20:47:13, last 21:05:06 UTC). Temp files grew by 177 and every writer in `temp_spill` is the probe's own `pg_stat_statements` scan or pg-meta (no application statement writes temp). Advisor counts unchanged: 1 + 14 WARN, INFO 9 + 155 + 1, every finding identical to the 20:12 set once the nested `observed_at` stamps are ignored (0 findings only on either side), and the top-15 `unused_index` rows are the same fifteen; `idx_invoices_order` is at 45 scans now (36 at 20:12). Database size 49 MB (48 at 20:12). No table was autovacuumed inside the window (`products` still 19:12:46 UTC, dead rows 8 to 17 on the 9 stock decrements); six were autoanalyzed, every one a table the E2E chain writes (vouchers 20:47:50, invoices and order_items 20:51:51, wallet_entries and stock_reservations 21:02:51, rate_limits 21:09:51 UTC, its `autoanalyze_count` 193 to 195 so twice in the window). carts grew from 4,458 to 4,503 live (549 to 570 dead), vouchers from 134 to 143, notification_outbox from 468 to 496, orders from 181 to 190 (146 to 155 paid), stock_reservations from 179 to 188, invoices from 148 to 157, `search_index_outbox` from 239 to 248 (the 9 product updates, nothing drains it); analytics_events stayed at 2,769 live rows. The ten largest tables are the same ten in the same order. Pooler and pgbouncer configuration re-read from the management API and byte-identical to the stored copies (same SHA-1 of the sorted JSON).

Across the seventeen measured passes before this one (16:24, 18:21, 21:24, 22:45, 23:56, 01:53, 01:59, 02:51, 08:14, 10:22, 11:45, 13:07, 14:34, 15:58, 17:19, 18:42 and 20:12 UTC) the application spike list grew from seven rows to eight, and all eight maxima still stand: six have not moved by a single millisecond since 16:24 UTC, `check_rate_limit` has not moved since it was first seen at 01:53 UTC, through 1,796 new calls at a 10.5 ms mean, and `consume_order_stock` has not moved since it was first seen at 20:12 UTC, through 9 new calls. No alert, no fix made; the fix candidates are recorded in section 4 and section 7 for the pending migration batch.

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

Totals: 14 client backends of 60 (23.3%), `numbackends` 16 including platform workers. Lock waits: 0. Statements older than 500 ms still running: 0. Deadlocks: 0. Buffer cache hit: 100.00%. Every idle backend is waiting on `ClientRead` (`activity_wait_events` in `rate-limit-probe-18.json`), none on a lock or IO.

Transactions since the database stats were created: 8,867,890 commits and 650,844 rollbacks (6.8%); since the 20:12 UTC pass, 20,279 commits and 1,525 rollbacks. The rollback share is dominated by read-only wrappers that end in ROLLBACK by design (the MCP `--read-only` mode and the management-API rehearsals in `docs/RUNBOOK.md`), not by failed application writes.

### Auth server

The performance advisor `auth_db_connections_absolute` (INFO) reports the Auth server pinned at an absolute 10 connections. That is a platform setting; it matters only if the compute size is ever raised, because Auth would not scale with it.

---

## 2. Query Performance (pg_stat_statements 1.11, schema `extensions`)

Statistics window: since the reset on 2026-07-16 19:10 UTC (97 days).

| Metric | Value |
|---|---|
| Distinct statements tracked | 4,962 (+26 since 20:12 UTC: 25 from the seventeenth pass's own follow-up probes at 20:15 to 20:18 UTC, one `cron.job` status read at 21:16 UTC, dated by `stats_since`; 0 application) |
| Total calls | 7,763,313 (+28,395 since 20:12 UTC) |
| Total execution time | 3,198,609 ms (53.3 minutes over 97 days) |
| Statements with mean over 500 ms | 6 (0 application) |
| Statements with max over 500 ms | 21 (8 application, 13 platform) |
| Temp files written (pg_stat_database) | 168,082 (+177 since 20:12 UTC; every writer in `temp_spill` is this probe's own pg_stat_statements scan or pg-meta, no application statement) |

### Application statements by total time

| Calls | Mean ms | Total ms | Statement |
|---|---|---|---|
| 45,898 | 4.0 | 182,526 | `seo_redirects` lookup by source_path (proxy redirect check) |
| 11,545 | 10.5 | 121,756 | rpc `check_rate_limit(p_key, p_max_attempts, p_window_seconds)` (`src/lib/utils/rate-limit.ts`) |
| 22,079 | 5.5 | 121,106 | rpc `available_stock(p_product_id)` (`src/lib/commerce/stock-live.ts`) |
| 887 | 46.3 | 41,108 | rpc `search_products(q, max_results)` |
| 7,092 | 5.5 | 39,331 | `carts` INSERT |
| 163,591 | 0.2 | 36,810 | `products` select by slug |
| 2,277 | 16.1 | 36,641 | rpc `fn_record_search` (`src/lib/search/record.ts`) |
| 2,055 | 16.4 | 33,789 | `analytics_events` select by event_name and occurred_at |
| 365 | 90.9 | 33,196 | rpc `release_expired_order_discounts` (cron; outside the probe's top 15, row re-read directly at 21:45 UTC, unchanged since 13:07) |
| 155 | 164.5 | 25,501 | rpc `consume_order_stock(p_order_id)` (`src/server/payments/finalize.ts`; outside the probe's top 15, row read directly at 21:45 UTC, section 4) |

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
| 1,532 | 4.0 | 1,159.2 | 31.3 | `carts` UPDATE (expires_at, items) |
| 11,545 | 10.5 | 1,137.4 | 22.5 | rpc `check_rate_limit` (`src/lib/utils/rate-limit.ts`) |
| 22,079 | 5.5 | 1,013.8 | 15.7 | rpc `available_stock` |
| 7,092 | 5.5 | 883.6 | 17.2 | `carts` INSERT |
| 887 | 46.3 | 857.1 | 66.0 | rpc `search_products` |
| 155 | 164.5 | 544.7 | 90.9 | rpc `consume_order_stock` (`src/server/payments/finalize.ts`), watch item (first seen 20:12 UTC) |
| 2,277 | 16.1 | 525.3 | 21.2 | rpc `fn_record_search` (`src/lib/search/record.ts`) |
| 2,055 | 16.4 | 515.6 | 34.9 | `analytics_events` select |

The seven rows other than `consume_order_stock` have means under 50 ms and standard deviations an order of magnitude below the max in a 97-day window. The shape matches cold cache after a compute pause or a plan re-prepare, not a missing index: `carts` has 125,954 index scans against 60 sequential scans, and `analytics_events` 4,839 against 24. All eight max values held across the 16:24, 18:21, 21:24, 22:45, 23:56, 01:53, 01:59, 02:51, 08:14, 10:22, 11:45, 13:07, 14:34, 15:58, 17:19, 18:42, 20:12 and 21:43 UTC runs (the eighth since 20:12) while cumulative call counts grew (350 new application calls across the eight rows in the 20:12 to 21:43 window, on top of 358 in the window before). Every row other than `consume_order_stock` moved by under 0.1 ms in mean and under 0.1 ms in stddev, and all five of those stddevs fell; a falling population stddev on added calls means the window's calls sat closer to the mean than the lifetime spread, so none of those windows held a slow call. `consume_order_stock` has its own subsection below (9 calls, max unmoved, first closing window met), then `check_rate_limit` (133 calls, slowest possible call 136 to 177 ms). No alert; one watch item open.

### The `consume_order_stock` spike (first seen 20:12 UTC, watch item open, first of two closing windows met at 21:43 UTC)

**21:43 UTC window (20:12 to 21:43, `logs/maint9/rate-limit-probe-18.json`).** 9 new calls and 1,873.8 ms of new execution (`total_exec_time` 23,627.3 to 25,501.1 ms), a 208.2 ms mean inside the window against 161.8 ms lifetime before it and 164.5 ms after. Max unchanged at 544.681965 ms (unrounded in both follow-up files; the 20:12 file carries it as 544.7 and the unrounded `app_spike_rows_unrounded` row of this pass matches the 20:12 `consume_order_stock_rows` row to the microsecond). Stddev up from 88.9509 to 90.8788 ms, the only application stddev that rose in this window. Sum of squares from `calls × (stddev² + mean²)`: 5,475,652 ms² now against 4,978,824 ms² at 20:12, so the 9 new calls contributed about 496,800 ms². The square root of that, 705 ms, exceeds the standing max, so on this row the variance arithmetic does not bound the slowest window call on its own; the unmoved max does (no call reached 544.7 ms), and with the other 8 calls at the window mean the ninth is bounded at 387 ms. The 9 calls are `stock_reservations.consumed_at` 20:47:27 to 21:04:49 UTC, one per order created 20:47:13 to 21:04:39 UTC (all 9 paid), which is the hourly Playwright money-path run (`docs/E2E-STATUS.md`, run 20, the MAINTENANCE_LOOP_4 session of 20:40 to 21:25 UTC). Per call in the window: 627 shared blocks hit (565 lifetime at 20:12), 15.4 dirtied (15.5) and 39.7 WAL records (40.7), `shared_blks_read` still 0 across all 155 calls, no temp. On `products`: `n_tup_upd` 862 to 871 (the 9 decrements), HOT updates still 32 of 871, dead rows 8 to 17, no autovacuum inside the window (last 19:12:46 UTC) and no autoanalyze (last 17:47:42 UTC); `stock_reservations` was autoanalyzed at 21:02:51 UTC, between the eighth and ninth call, and the ninth call did not move the max. `search_index_outbox` grew 239 to 248 (one row per product update, nothing draining it), the `realtime.messages` partitions still end at 2026-10-08 with `n_tup_ins` 0 on every one and `realtime.subscription` has 0 rows, so the `products_broadcast_live` send had nowhere to land on any of the 9 calls. The audit chain of the 9 orders is 139 rows (`audit_rows_window`: 18 `wallet_accounts` updates, 9 each of `invoices` created and updated, `order` status_change, `order_items` created and updated, `orders` created and updated, `payments` created and updated, `products` updated, `settlement_events` created, `vouchers` created, `wallet_entries` created, plus 3 `voucher_redemptions` created and 1 `vouchers` updated), which equals the growth of `audit_log` (3,593 to 3,732 live).

**Closing rule.** The item closes after two consecutive windows that contain the hourly E2E burst and add calls without moving the max over 544.7 ms. This window is the first such window: burst present (9 calls), max unmoved. One more window with the same reading closes it. It escalates to an alert if the mean crosses 500 ms (164.5 ms now) or a second max over 500 ms appears (none did). The 208 ms window mean against the 162 ms lifetime mean is noted and is not a trigger: the function's cost is the trigger work on `products` described below and the window held the same concurrent writers as the one before.

**20:12 UTC window (18:42 to 20:12, the pass that opened the item).**

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

### The `check_rate_limit` spike (first seen 01:53 UTC; max unmoved through 21:43 UTC, variance moved at 13:07 UTC, quiet at 14:34, 15:58, 17:19 and 18:42 UTC, a 0.11 ms rise at 20:12 UTC, quiet again at 21:43 UTC, watch item closed)

**21:43 UTC window (20:12 to 21:43, `logs/maint9/rate-limit-probe-18.json`).** 133 new calls and 1,316.4 ms of new execution (`total_exec_time` 120,439.8 to 121,756.2 ms), a 9.9 ms mean inside the window against 12.3 ms in the window before and 10.5 ms lifetime. Max unchanged at 1,137.366223 ms (unrounded); stddev down from 22.5960 to 22.5013 ms, which takes back most of the 20:12 rise. Sum of squares from `calls × (stddev² + mean²)`: 7,129,377 ms² now against 7,097,877 ms² at 20:12 (three-decimal means in both), so the 133 new calls contributed about 31,500 ms². The square root of that delta, 177 ms, is the hardest upper bound on any single call in the window; with the other 132 calls at the window mean it is 136 ms. No call came within a factor of two of 500 ms, so the watch item stays closed. `rate_limits` was autoanalyzed twice inside the window (`autoanalyze_count` 193 to 195, last at 21:09:51 UTC, `n_live_tup` 761 to 771, dead rows 94 to 95, `last_autovacuum` still 16:24:38 UTC) and neither produced a slow call; the autoanalyze correlation is now three for eight across today's windows that held one. `shared_blks_read` stays at 0 across all 11,545 calls (1,207,743 hits), `rate_limits_key_key` carries 14,906 of 14,913 index scans (the index scan count grew by exactly the 133 calls), `pg_stat_user_functions` is still empty, and the four attribution settings are unchanged (`track_functions = none`, `track_io_timing = off`, `log_min_duration_statement = -1`, `pg_stat_statements.track = top`; `pg_stat_statements.max = 5000`, so the table has 38 free slots left before eviction starts, see section 7).

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

The `search_products` RPC is still worth watching: a 46 ms mean with 66 ms stddev is the widest spread in the application set after `consume_order_stock`. It had no calls in this window (887 since 20:12 and since 18:42). It is the Postgres fallback that production uses because Meilisearch is off (`docs/` UX21 notes); it does not get faster until the engine is switched.

---

## 5. Performance Advisors (get_advisors type=performance)

| Advisor | Level | Count | Notes |
|---|---|---|---|
| auth_rls_initplan | WARN | 1 | `profiles.profiles_super_admin_mfa` re-evaluates `auth.<fn>()` per row. Wrap it in `(select ...)`. Candidate for the next migration batch in `migrations/pending/`. |
| multiple_permissive_policies | WARN | 14 | banners, cashback_ledger, homepage_sections, payment_events, payout_statement_lines, payout_statements, refunds, supplier_branches (4 actions), support_ticket_messages, support_tickets, whatsapp_contacts. Each pair is an owner policy plus a staff policy; Postgres evaluates both on every row. Correct but slower. |
| unindexed_foreign_keys | INFO | 9 | affiliate_attributions (3), affiliate_links, affiliate_payouts, auth_wa_otps, supplier_card_tokens (2), supplier_card_verifications. All low-row tables today. |
| unused_index | INFO | 155 | Unchanged since 15:58 UTC (every finding identical to the 20:12 set once the nested `observed_at` is ignored), and the top-15 rows by size are the same fifteen. `idx_invoices_order`, which left the list between 14:34 and 15:58 UTC, is at 45 scans now (36 at 20:12). Largest remaining is `idx_audit_log_action` at 176 kB. Total waste is small; no action on its own, but section 4 notes that `products` carries 29 indexes on 82 rows and pays for all of them on every stock decrement. |
| auth_db_connections_absolute | INFO | 1 | See section 1. |

None of these is a slow-query cause today. The two WARN rows are the only ones that scale with traffic, and both are policy shape, not data volume.

---

## 6. Storage

| Item | Value |
|---|---|
| Database size | 49 MB (48 MB at 18:42 and 20:12 UTC; 47 MB at 15:58 and 17:19 UTC; 46 MB at 13:07 and 14:34 UTC; 45 MB at 10:22 and 11:45 UTC; 44 MB from 21:24 UTC on 20.10 through 08:14 UTC on 21.10; 43 MB at 18:21 UTC) |
| Largest table | audit_log, 9,280 kB, 3,732 live rows (+139 since 20:12 UTC, the E2E run 20 order chain; 0 dead, last autovacuum 19:11:47 UTC, autoanalyze 19:24:47 UTC) |
| carts | 2,944 kB, 4,503 live rows (570 dead), autovacuum 2026-10-16, autoanalyze 2026-10-21 16:29 UTC; grows every pass (+45 live rows since 20:12 UTC, guest carts from the storefront) |
| analytics_events | 2,024 kB, 2,769 live rows (unchanged since 14:34 UTC), autovacuum 2026-10-21 |
| products | 752 kB, 82 live rows, 17 dead rows (8 at 20:12 UTC, the 9 stock decrements), autovacuum 2026-10-21 19:12 UTC (none in this window), autoanalyze 2026-10-21 17:47 UTC |
| rate_limits | 336 kB, 771 live rows, 95 dead (94 at 20:12 UTC), autovacuum 2026-10-21 16:24 UTC, autoanalyze 2026-10-21 21:09 UTC (two in the window, section 4) |
| invoices | 296 kB, 157 live rows, 13 dead (4 at 20:12 UTC), autovacuum 2026-10-21 19:24 UTC, autoanalyze 20:51 UTC; tenth largest, `users` (14 live, 19 dead, autoanalyze 19:39 UTC) stays below it |
| orders / order_items / stock_reservations | 190 / 226 / 188 live rows (155 reservations consumed, 17 released, 16 open; stock_reservations autoanalyzed 21:02 UTC); the three tables `consume_order_stock` and the E2E run touch, all small |
| search_index_outbox | 160 kB, 248 live rows (239 at 20:12 UTC), no consumer while Meilisearch is off (section 4) |
| Replication slots | none (the application does not use Realtime; the `wal->>` poller rows in pg_stat_statements are historical platform traffic, `realtime.subscription` has 0 live rows and the `realtime.messages` partitions end at 2026-10-08 with 0 inserts) |

---

## 7. Verification Checklist (2026-10-21 21:43 UTC)

- [x] Supabase MCP reached (official server over stdio, `--read-only`, 13 tools listed)
- [x] Pool measured from pg_stat_activity, not inferred from the plan tier
- [x] Pooler configuration re-read from the management API (unchanged since 16:24 UTC on 20.10; SHA-1 of the sorted JSON matches `logs/maint9/pooler.json` and `pgbouncer.json`)
- [x] pg_stat_statements queried for mean and max over 500 ms
- [x] Statements classified as application versus platform (`classifyStatement`, tested)
- [x] Performance advisors fetched
- [x] No application statement with mean over 500 ms
- [x] All eight max-over-500 application rows unmoved: seven across eighteen passes from 16:24 UTC on 20.10 to 21:43 UTC on 21.10, the eighth (`consume_order_stock`) since 20:12 UTC
- [x] `consume_order_stock` watch item re-read unrounded: 9 window calls dated through `stock_reservations.consumed_at` to the 9 orders of E2E run 20 (20:47 to 21:04 UTC), max 544.681965 ms identical, mean 161.8 to 164.5 ms, stddev 88.95 to 90.88, no autovacuum of `products` in the window, `search_index_outbox` +9, realtime partitions still end 2026-10-08 with 0 inserts; first of two closing windows met (section 4)
- [x] Re-checked `check_rate_limit` through 02:51, 08:14, 10:22, 11:45, 13:07, 14:34, 15:58, 17:19, 18:42, 20:12 and 21:43 UTC; max unmoved through 1,796 new calls, stddev down 0.09 ms on 133 calls at a 9.9 ms window mean, slowest possible call in the window 136 to 177 ms, through two more autoanalyzes of `rate_limits`, follow-up probe recorded, watch item stays closed
- [x] The 26 new pg_stat_statements rows since 20:12 UTC attributed by `stats_since` to the seventeenth pass's own follow-up probes (25, 20:15 to 20:18 UTC, `supabase_read_only_user`) and one `cron.job` status read at 21:16 UTC (`postgres`), none application traffic
- [x] `unused_index` advisor unchanged at 155, every finding identical ignoring `observed_at`, top-15 list identical, no index was dropped
- [x] Probe script under test: `scripts/db-mcp-probe.test.mjs` (10 tests, green this pass)
- [ ] `consume_order_stock` watch item: close after two consecutive windows that contain the hourly E2E burst without a new max over 544.7 ms (one of two met at 21:43 UTC); alert if the mean crosses 500 ms or a second max over 500 ms appears
- [ ] `pg_stat_statements.max = 5000` with 4,962 rows tracked: the probes themselves add about 25 rows per pass through their parameterised follow-ups, so eviction of least-used rows starts within two passes; the main probe's rows are constant-text and already tracked, eviction will take one-call platform rows first, and `pg_stat_statements_reset()` needs a role this pass does not have, so this is recorded here and left for the next pass to confirm (section 2 `statements` count stops growing at 5,000)
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

The script prints a one-line summary on stderr (`pool 14/60 (23.3%), statements over 500ms by mean: 6 (app: 0), app spikes: 8`, this pass's exact line) and writes the full JSON on stdout. `summary.alert` is true only when an application statement averages over 500 ms.

Reading the raw numbers afterwards:

```bash
node -e 'const r=require("./logs/maint9/result.json"); console.log(JSON.stringify(r.summary,null,1))'
```

---

**Report Status:** COMPLETE (measured 2026-10-21 21:43 UTC; eighteenth measured pass, all eight application spike maxima unmoved through 350 new application calls in the window, no new row, no application mean near 500 ms, no alert; the `consume_order_stock` watch item has one of its two closing windows met (9 calls, max 544.7 ms unmoved, mean 164.5 ms); the `check_rate_limit` watch item closed at 15:58 stays closed, slowest possible call 136 to 177 ms, section 4)
**Next Review:** MAINTENANCE_LOOP cycle, or after any migration in the pending batch is applied
**Escalation:** none required
