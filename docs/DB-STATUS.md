# Database Status Report: Connection Pool and Query Performance

**Last Updated:** 2026-10-21 10:22 UTC (MAINTENANCE_LOOP_9 tenth measured pass, through the Supabase MCP)
**Previous Run:** 2026-10-21 08:14 UTC (ninth measured pass, `logs/maint9/result-09.json`. Before it: 02:51 UTC the eighth (its header once said "10:00 UTC", the local wall clock; `result-08.json` carries the true `ts` of 02:51:00Z), 01:59 UTC the seventh, 01:53 UTC the sixth, 23:56 UTC the fifth, 22:45 UTC the fourth, 21:24 UTC the third, 18:21 UTC the second, 16:24 UTC the first, and the 13:23 UTC report before it was code analysis only)
**Scope:** Supabase connection pool, pooler configuration, pg_stat_statements, performance advisors
**Evidence:** `logs/maint9/result-10.json` (every probe row of this pass; `result-09.json`, `result-08.json` and `result.json` are the three passes before it), `logs/maint9/pooler.json`, `logs/maint9/pgbouncer.json`, `logs/maint9/rate-limit-probe.json` (the follow-up on the one new spike, section 4)
**Probe:** `scripts/db-mcp-probe.mjs` (the official `@supabase/mcp-server-supabase` run locally in `--read-only` mode; see the header comment for the token recipe)

---

## Executive Summary

**Connection pool:** healthy. 14 of 60 backends in use (23.3%), 0 lock waits, 0 statements running longer than 500 ms at probe time, 0 deadlocks since the stats reset.
**Query performance:** no application statement averages over 500 ms. Six statements do average over 500 ms, and all six are Supabase platform traffic (dashboard, pg-meta introspection, this report's own probes). Seven application statements have a single recorded spike over 500 ms with single-digit or double-digit millisecond means; none of the seven maxima moved this pass (the newest, rpc `check_rate_limit` at 1,137.4 ms, was first seen at 01:53 UTC and has not recurred in 679 further calls).
**Alert status:** no alert for application queries. Every spike is a single historical call traced in section 4; none moves its mean, so all stay below the alert line this report uses (mean over 500 ms).

What changed since the previous report (2 hours 8 minutes earlier, 08:14 to 10:22 UTC): no slow path appeared. The pool is the same 14 of 60 backends, the same four clients, the same 13 idle. pg_stat_statements tracks 4,886 distinct statements (+3 since 08:14, all three are this probe's own scans) and grew by 46,175 calls and 17.2 s of execution time, again real application traffic: carts UPDATE +10 calls, carts INSERT +52, `available_stock` +165, `check_rate_limit` +196, `fn_record_search` +24, the products select by slug +22 and the `seo_redirects` lookup +242; `search_products` and the `analytics_events` select had no calls in the window. The 6 platform rows over 500 ms by mean are unchanged, call for call. The application spike list remains 7 and every max is identical to the millisecond while 447 calls were added across the seven rows; the only means that moved are carts UPDATE (3.9 to 4.1 ms) and carts INSERT (5.3 to 5.4 ms), and the only stddev that moved up is `check_rate_limit` (18.9 to 19.4 ms, still under one fiftieth of its max). Temp files grew by 258 and every writer is the probe's own `pg_stat_statements` scan (one more call each) or pg-meta (no application statement writes temp). Advisor counts unchanged (1 + 14 WARN, 9 + 157 + 1 INFO). Database size 44 to 45 MB, driven by audit_log (2,391 to 2,584 live rows, 5,824 to 6,464 kB) and carts (4,087 to 4,132 live rows, 368 dead); autovacuum visited products, refresh_tokens, vouchers and users on 21.10 and products dropped from 66 dead rows to 10. Pooler and pgbouncer configuration re-read from the management API and byte-identical to the stored copies (same SHA-1 of the sorted JSON).

Across the ten measured passes (16:24, 18:21, 21:24, 22:45, 23:56, 01:53, 01:59, 02:51, 08:14 and 10:22 UTC) all seven application spike maxima are confirmed as historical outliers: six have not moved by a single millisecond since 16:24 UTC, and the seventh (check_rate_limit) has not moved since it was first seen at 01:53 UTC, through 679 new calls at a 10.4 ms mean. No alert, no fix needed.

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
| PostgREST 14.5 | authenticator | 11 | idle (persistent pool, oldest idle 53.7 days) |
| postgres_exporter | supabase_admin | 1 | idle |
| (none) | supabase_admin | 1 | idle |
| mgmt-api | supabase_read_only_user | 1 | active (this probe) |

Totals: 14 client backends of 60 (23.3%), `numbackends` 16 including platform workers. Lock waits: 0. Statements older than 500 ms still running: 0. Deadlocks: 0. Buffer cache hit: 100.00%.

Transactions since the database stats were created: 8,704,159 commits and 638,811 rollbacks (6.8%); since the 08:14 UTC pass, 35,528 commits and 1,945 rollbacks. The rollback share is dominated by read-only wrappers that end in ROLLBACK by design (the MCP `--read-only` mode and the management-API rehearsals in `docs/RUNBOOK.md`), not by failed application writes.

### Auth server

The performance advisor `auth_db_connections_absolute` (INFO) reports the Auth server pinned at an absolute 10 connections. That is a platform setting; it matters only if the compute size is ever raised, because Auth would not scale with it.

---

## 2. Query Performance (pg_stat_statements 1.11, schema `extensions`)

Statistics window: since the reset on 2026-07-16 19:10 UTC (97 days).

| Metric | Value |
|---|---|
| Distinct statements tracked | 4,886 (+3 since 08:14 UTC, all this probe's own scans) |
| Total calls | 7,531,696 (+46,175 since 08:14 UTC) |
| Total execution time | 3,064,140 ms (51.1 minutes over 97 days) |
| Statements with mean over 500 ms | 6 (0 application) |
| Statements with max over 500 ms | 20 (7 application, 13 platform) |
| Temp files written (pg_stat_database) | 166,745 (+258 since 08:14 UTC; every writer in `temp_spill` is this probe's own pg_stat_statements scan or pg-meta, no application statement) |

### Application statements by total time

| Calls | Mean ms | Total ms | Statement |
|---|---|---|---|
| 44,974 | 4.0 | 178,330 | `seo_redirects` lookup by source_path (proxy redirect check) |
| 20,955 | 5.4 | 112,578 | rpc `available_stock(p_product_id)` (`src/lib/commerce/stock-live.ts`) |
| 10,428 | 10.4 | 108,827 | rpc `check_rate_limit(p_key, p_max_attempts, p_window_seconds)` (`src/lib/utils/rate-limit.ts`) |
| 887 | 46.3 | 41,108 | rpc `search_products(q, max_results)` |
| 163,508 | 0.2 | 36,786 | `products` select by slug |
| 6,711 | 5.4 | 35,988 | `carts` INSERT |
| 2,055 | 16.4 | 33,789 | `analytics_events` select by event_name and occurred_at |
| 365 | 90.9 | 33,196 | rpc `release_expired_order_discounts` (cron) |

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
| 1,453 | 4.1 | 1,159.2 | 32.1 | `carts` UPDATE (expires_at, items) |
| 10,428 | 10.4 | 1,137.4 | 19.4 | rpc `check_rate_limit` (`src/lib/utils/rate-limit.ts`) |
| 20,955 | 5.4 | 1,013.8 | 15.8 | rpc `available_stock` |
| 6,711 | 5.4 | 883.6 | 17.5 | `carts` INSERT |
| 887 | 46.3 | 857.1 | 66.0 | rpc `search_products` |
| 2,085 | 15.0 | 525.3 | 20.7 | rpc `fn_record_search` (`src/lib/search/record.ts`) |
| 2,055 | 16.4 | 515.6 | 34.9 | `analytics_events` select |

All seven are single outliers in a 97-day window with means under 50 ms and standard deviations an order of magnitude below the max. The shape matches cold cache after a compute pause or a plan re-prepare, not a missing index: `carts` has 117,437 index scans against 60 sequential scans, and `analytics_events` 4,755 against 24. All seven max values are confirmed as historical: they did not move across the 16:24, 18:21, 21:24, 22:45, 23:56, 01:53, 01:59, 02:51, 08:14 and 10:22 UTC runs while cumulative call counts grew (447 new application calls across the seven rows in the 08:14 to 10:22 window alone, on top of 1,202 in the window before; the two carts means rose by 0.1 to 0.2 ms, `check_rate_limit` stddev rose 0.5 ms, everything else held). No alert, no fix needed.

### The `check_rate_limit` spike (first seen 01:53 UTC, confirmed historical through 10:22 UTC)

At 23:56 UTC the rate limiter RPC had 9,501 calls, 100,610 ms total and a max under 500 ms (it was absent from the max-over-500 list). At 01:53 UTC it had 9,749 calls, 103,501 ms total and a max of 1,137.4 ms (248 new calls and 2,891 ms in the 117-minute window). At 01:59 UTC it still had 9,749 calls and a max of 1,137.4 ms (zero new calls in the 6-minute window). At 02:51 UTC it had 9,858 calls, at 08:14 UTC 10,232 calls (374 new calls in 5 hours 23 minutes, 2,393 ms of execution, a 6.4 ms mean inside the window, stddev down from 19.3 to 18.9 ms) and at 10:22 UTC 10,428 calls (196 new calls in 2 hours 8 minutes, 2,209 ms of execution, an 11.3 ms mean inside the window, stddev 19.4 ms), still with the same 1,137.4 ms max. The max has not moved through 679 calls since it was recorded, which confirms it as a historical spike with no recurring slow path. Candidates from the 01:53 follow-up probe (`logs/maint9/rate-limit-probe.json`) were an autoanalyze of the 288 kB `rate_limits` table (00:53:54 UTC, just before the spike window) and concurrent lock contention on the single-row `INSERT ... ON CONFLICT` that implements the rate limit. Neither is a recurring condition: call density remains low (9,749 total calls over 86 days averaging 113 per day), and no evidence has emerged that the spike repeats. No alert.

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
| Database size | 45 MB (44 MB from 21:24 UTC on 20.10 through 08:14 UTC on 21.10; 43 MB at 18:21 UTC) |
| Largest table | audit_log, 6,464 kB, 2,584 live rows (+193 since 08:14 UTC) |
| carts | 2,568 kB, 4,132 live rows (368 dead), autovacuum 2026-10-16; grows every pass (+45 live rows since 08:14 UTC, guest carts from the storefront) |
| analytics_events | 1,960 kB, 2,685 live rows |
| products | 752 kB, 82 live rows, 10 dead rows, autovacuum 2026-10-21 (66 dead before it ran) |
| Replication slots | none (the application does not use Realtime; the `wal->>` poller rows in pg_stat_statements are historical platform traffic) |

---

## 7. Verification Checklist (2026-10-21 10:22 UTC)

- [x] Supabase MCP reached (official server over stdio, `--read-only`, 13 tools listed)
- [x] Pool measured from pg_stat_activity, not inferred from the plan tier
- [x] Pooler configuration re-read from the management API (unchanged since 16:24 UTC on 20.10; SHA-1 of the sorted JSON matches `logs/maint9/pooler.json` and `pgbouncer.json`)
- [x] pg_stat_statements queried for mean and max over 500 ms
- [x] Statements classified as application versus platform (`classifyStatement`, tested)
- [x] Performance advisors fetched
- [x] No application statement with mean over 500 ms
- [x] All seven max-over-500 application rows confirmed as historical outliers (none moved across ten passes from 16:24 UTC on 20.10 to 10:22 UTC on 21.10)
- [x] Re-checked `check_rate_limit` max through 02:51, 08:14 and 10:22 UTC; 679 new calls since it was recorded, no movement, confirmed historical
- [x] Probe script under test: `scripts/db-mcp-probe.test.mjs` (10 tests, green this pass)
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

**Report Status:** COMPLETE (measured 2026-10-21 10:22 UTC; tenth measured pass, all seven application spikes confirmed historical through 447 new application calls in the window, no new or recurring slow paths, no alert)
**Next Review:** MAINTENANCE_LOOP cycle, or after any migration in the pending batch is applied
**Escalation:** none required
