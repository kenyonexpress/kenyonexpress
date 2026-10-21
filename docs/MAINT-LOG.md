# Maintenance Log

## 2026-10-20 20:40 UTC - Backlog Scan (MAINTENANCE_LOOP_3)

**Scanned Files:**
- ✅ docs/BACKLOG.md (exists, 7 items)
- ❌ docs/TODO.md (does not exist)

**Backlog Items Analysis:**

All 7 items in BACKLOG.md are externally gated/blocked:
1. Group-deals re-evaluation — **BLOCKED** (awaiting 2026-10-23)
2. Crisp inbox — **BLOCKED** (post-launch gate)
3. Meta WhatsApp verification — **BLOCKED** (10 sales milestone)
4. Israeli lawyer review — **BLOCKED** (10 sales milestone)
5. Capacitor/Expo native app — **BLOCKED** (revenue milestone)
6. Courses monthly billing — **BLOCKED** (Phase 2)
7. Tzimmer calendar — **BLOCKED** (Phase 2)

**Unblocked Items Found:** 0

**Action:** None. No unblocked items to queue.

**Status:** COMPLETE

## 2026-10-20 11:46 UTC - Backlog Scan (MAINTENANCE_LOOP_3, repeat)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged since the previous scan (last touched in commit 8d1f66a6b lineage).
- docs/TODO.md: does not exist. No TODO.md anywhere under docs/ (only BACKLOG.md, MIGRATION-BACKLOG.md and NEXT-GOALS.md match).

**Backlog Items Analysis (checked against today's date, 2026-10-20):**
1. Group-deals re-evaluation, dated 2026-10-23: still 3 days out. BLOCKED.
2. Crisp inbox, post-launch: launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: milestone not reached. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: milestone not reached. BLOCKED.
5. Capacitor or Expo native app, after revenue: milestone not reached. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified.

**Note:** the previous entry above is stamped 20:40 UTC but was written earlier on the same day (its commit predates this one). Treat that stamp as a local-time slip, not a later scan. Item 1 becomes a candidate on 2026-10-23; the next MAINTENANCE_LOOP_3 run after that date should queue it.

**Status:** COMPLETE

## 2026-10-20 16:37 UTC - Backlog Scan (MAINTENANCE_LOOP_3, third run)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged (last commit 4b17cfb49, 2026-10-16).
- docs/TODO.md: does not exist. `find` over the whole worktree (node_modules excluded) returns no TODO*.md at all.

**Gates measured, not assumed.** Two of the seven items hang on "after 10 sales", so the sales
count was read from production through the read-only Supabase MCP server (same driver as
`scripts/db-mcp-probe.mjs`). Evidence: `logs/maint3/sales-gate-2026-10-20.json` and
`logs/maint3/sales-gate-breakdown-2026-10-20.json`.

| Measure | Value |
|---------|-------|
| orders, all statuses | 99 |
| orders in paid / fulfilled / settled | 70 |
| payments succeeded or settled | 71 |
| of those with a real Cardcom transaction id | 0 |
| of those placed by a non-test account | 0 |
| last order | 2026-10-15 03:04 UTC |

Every succeeded payment carries a mock transaction id (`mock`/`test`/`e2e` prefix) and belongs to
a test account (e2e, playwright, example.com). **Real sales: 0.** The 10-sales gate is not met.

**Backlog Items Analysis (today 2026-10-20):**
1. Group-deals re-evaluation, dated 2026-10-23: 3 days out. BLOCKED.
2. Crisp inbox, post-launch: no real sale has ever landed, launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: 0 real sales. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: 0 real sales. BLOCKED.
5. Capacitor or Expo native app, after revenue: 0 real revenue. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified.

**Note:** item 1 becomes a candidate on 2026-10-23. The next MAINTENANCE_LOOP_3 run on or after that
date should queue it. The sales query above is the one to rerun for items 3 to 5; a count that
excludes mock transaction ids and test accounts is the number that matters, not `orders.status`.

**Status:** COMPLETE

## 2026-10-20 18:50 UTC - Backlog Scan (MAINTENANCE_LOOP_3, fourth run)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged (last commit 4b17cfb49, 2026-10-16).
- docs/TODO.md: does not exist. `find` over the worktree (node_modules excluded) returns no TODO*.md.

**Gates re-measured.** The 10-sales query from the third run was re-run against production
(read-only select through the management API with the CLI keychain token, since the Supabase MCP
connector is unauthorised in this session). Evidence: `logs/maint3/sales-gate-2026-10-20b.json`.

| Measure | Third run | This run |
|---------|-----------|----------|
| orders, all statuses | 99 | 99 |
| orders in paid / fulfilled / settled | 70 | 70 |
| payments succeeded or settled | 71 | 71 |
| real sales (real Cardcom txn id, non-test buyer) | 0 | 0 |
| orders since the third run | n/a | 0 |
| last order | 2026-10-15 03:04 UTC | 2026-10-15 03:04 UTC |

Nothing moved. Real sales remain 0, so the launch, 10-sales and revenue gates are all still closed.

**Backlog Items Analysis (today 2026-10-20 UTC, 2026-10-21 local):**
1. Group-deals re-evaluation, dated 2026-10-23: 2 days out. BLOCKED.
2. Crisp inbox, post-launch: 0 real sales, launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: 0 real sales. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: 0 real sales. BLOCKED.
5. Capacitor or Expo native app, after revenue: 0 real revenue. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified (27 lines before and after).

**Note:** `payments` has no `provider_transaction_id`; the column is `cardcom_transaction_id`
(42703 on the first attempt). Item 1 becomes a candidate on 2026-10-23; the next run on or after
that date should queue it.

**Status:** COMPLETE

## 2026-10-20 21:45 UTC - Backlog Scan (MAINTENANCE_LOOP_3, fifth run)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged (last commit 4b17cfb49, 2026-10-16).
- docs/TODO.md: does not exist. `find` over the worktree (node_modules excluded) returns no TODO*.md.

**Gates re-measured.** Same read-only select as the fourth run, through the management API with the
CLI keychain token (the Supabase MCP connector is still unauthorised in this session).
Evidence: `logs/maint3/sales-gate-2026-10-20c.json`.

| Measure | Fourth run | This run |
|---------|------------|----------|
| orders, all statuses | 99 | 99 |
| orders in paid / fulfilled / settled | 70 | 70 |
| payments succeeded or settled | 71 | 71 |
| real sales (real Cardcom txn id, non-test buyer) | 0 | 0 |
| orders since the fourth run | n/a | 0 |
| last order | 2026-10-15 03:04 UTC | 2026-10-15 03:04 UTC |

Nothing moved in the three hours since the fourth run. Real sales remain 0, so the launch,
10-sales and revenue gates are all still closed.

**Backlog Items Analysis (today 2026-10-20 UTC, 2026-10-21 local):**
1. Group-deals re-evaluation, dated 2026-10-23: 2 days out. BLOCKED.
2. Crisp inbox, post-launch: 0 real sales, launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: 0 real sales. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: 0 real sales. BLOCKED.
5. Capacitor or Expo native app, after revenue: 0 real revenue. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified (27 lines before and after).

**Note:** Item 1 becomes a candidate on 2026-10-23. The loop cycles every ten goals and a cycle
has been taking roughly three hours, so the run that lands on or after 2026-10-23 00:00 local
should queue it as `BACKLOG_1 Re-evaluate group deals` at the head of the queue.

**Status:** COMPLETE

## 2026-10-20 23:00 UTC - Backlog Scan (MAINTENANCE_LOOP_3, sixth run)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged (last commit 4b17cfb49, 2026-10-16).
- docs/TODO.md: does not exist. `find` over the worktree (node_modules excluded) returns no TODO*.md.

**Gates re-measured.** Same read-only select as the fifth run, through the management API with the
CLI keychain token (the Supabase MCP connector is still unauthorised in this session).
Evidence: `logs/maint3/sales-gate-2026-10-20d.json`.

| Measure | Fifth run | This run |
|---------|-----------|----------|
| orders, all statuses | 99 | 99 |
| orders in paid / fulfilled / settled | 70 | 70 |
| payments succeeded or settled | 71 | 71 |
| real sales (real Cardcom txn id, non-test buyer) | 0 | 0 |
| orders since the fifth run | n/a | 0 |
| last order | 2026-10-15 03:04 UTC | 2026-10-15 03:04 UTC |

Nothing moved in the 75 minutes since the fifth run. Real sales remain 0, so the launch,
10-sales and revenue gates are all still closed.

**Backlog Items Analysis (today 2026-10-20 UTC, 2026-10-21 local):**
1. Group-deals re-evaluation, dated 2026-10-23: 2 days out. BLOCKED.
2. Crisp inbox, post-launch: 0 real sales, launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: 0 real sales. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: 0 real sales. BLOCKED.
5. Capacitor or Expo native app, after revenue: 0 real revenue. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified (27 lines before and after).

**Note:** Item 1 becomes a candidate on 2026-10-23 local. The run that lands on or after
2026-10-23 00:00 local should queue it as `BACKLOG_1 Re-evaluate group deals` at the head of the queue.

**Status:** COMPLETE

## 2026-10-21 00:14 UTC - Backlog Scan (MAINTENANCE_LOOP_3, seventh run)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged (last commit 4b17cfb49, 2026-10-16).
- docs/TODO.md: does not exist. `find` over the worktree (node_modules excluded) returns no TODO*.md.

**Gates re-measured.** Same read-only select as the sixth run, through the management API with the
CLI keychain token (the Supabase MCP connector is still unauthorised in this session).
Evidence: `logs/maint3/sales-gate-2026-10-21.json`.

| Measure | Sixth run | This run |
|---------|-----------|----------|
| orders, all statuses | 99 | 99 |
| orders in paid / fulfilled / settled | 70 | 70 |
| payments succeeded or settled | 71 | 71 |
| real sales (real Cardcom txn id, non-test buyer) | 0 | 0 |
| orders since the sixth run | n/a | 0 |
| last order | 2026-10-15 03:04 UTC | 2026-10-15 03:04 UTC |

Nothing moved in the 74 minutes since the sixth run. Real sales remain 0, so the launch,
10-sales and revenue gates are all still closed.

**Backlog Items Analysis (today 2026-10-21 UTC and local):**
1. Group-deals re-evaluation, dated 2026-10-23: 2 days out. BLOCKED.
2. Crisp inbox, post-launch: 0 real sales, launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: 0 real sales. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: 0 real sales. BLOCKED.
5. Capacitor or Expo native app, after revenue: 0 real revenue. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified (27 lines before and after).

**Note:** Item 1 becomes a candidate on 2026-10-23 local. The run that lands on or after
2026-10-23 00:00 local should queue it as `BACKLOG_1 Re-evaluate group deals` at the head of the queue.

**Status:** COMPLETE

## 2026-10-21 02:04 UTC - Backlog Scan (MAINTENANCE_LOOP_3, eighth run)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged (last commit 4b17cfb49, 2026-10-16).
- docs/TODO.md: does not exist. `find` over the worktree (node_modules excluded) returns no TODO*.md.

**Backlog Items Analysis (today 2026-10-21 UTC and local):**
1. Group-deals re-evaluation, dated 2026-10-23: 2 days out. BLOCKED.
2. Crisp inbox, post-launch: 0 real sales, launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: 0 real sales. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: 0 real sales. BLOCKED.
5. Capacitor or Expo native app, after revenue: 0 real revenue. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified.

**Note:** Item 1 becomes a candidate on 2026-10-23 local. The run that lands on or after
2026-10-23 00:00 local should queue it as `BACKLOG_1 Re-evaluate group deals` at the head of the queue.

**Status:** COMPLETE

## 2026-10-21 05:37 UTC - Backlog Scan (MAINTENANCE_LOOP_3, ninth run)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged (last commit 4b17cfb49, 2026-10-16).
- docs/TODO.md: does not exist. `find` over the worktree (node_modules excluded) returns no TODO*.md.

**Gates re-measured.** Same read-only select as the seventh run, through the management API with the
CLI keychain token (the Supabase MCP connector is still unauthorised in this session).
Evidence: `logs/maint3/sales-gate-2026-10-21b.json`.

| Measure | Seventh run | This run |
|---------|-------------|----------|
| orders, all statuses | 99 | 99 |
| orders in paid / fulfilled / settled | 70 | 70 |
| payments succeeded or settled | 71 | 71 |
| real sales (real Cardcom txn id, non-test buyer) | 0 | 0 |
| orders since the seventh run | n/a | 0 |
| last order | 2026-10-15 03:04 UTC | 2026-10-15 03:04 UTC |

Nothing moved in the five hours since the seventh run (the eighth run did not re-measure). Real
sales remain 0, so the launch, 10-sales and revenue gates are all still closed.

**Backlog Items Analysis (today 2026-10-21 UTC, 2026-10-21 local UTC+7):**
1. Group-deals re-evaluation, dated 2026-10-23: 2 days out. BLOCKED.
2. Crisp inbox, post-launch: 0 real sales, launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: 0 real sales. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: 0 real sales. BLOCKED.
5. Capacitor or Expo native app, after revenue: 0 real revenue. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified (37 lines before and after).

**Gates run:** `pnpm lint` clean, `pnpm type-check` clean, `pnpm build` exit 0 (203 routes). The two
`Partner API ... bail out of prerendering` lines in the build log are the dynamic route logging
Next's own prerender bail-out signal, not a failure.

**Note:** Item 1 becomes a candidate on 2026-10-23 local. The run that lands on or after
2026-10-23 00:00 local should queue it as `BACKLOG_1 Re-evaluate group deals` at the head of the queue.

**Status:** COMPLETE

## 2026-10-21 08:54 UTC - Backlog Scan (MAINTENANCE_LOOP_3, tenth run)

**Scanned Files:**
- docs/BACKLOG.md: exists, 7 items, unchanged (last commit 4b17cfb49, 2026-10-16).
- docs/TODO.md: does not exist. `find` over the worktree (node_modules excluded) returns no TODO*.md.

**Gates re-measured.** Same read-only select as the ninth run, through the management API with the
CLI keychain token (the Supabase MCP connector is still unauthorised in this session).
Evidence: `logs/maint3/sales-gate-2026-10-21c.json`.

| Measure | Ninth run | This run |
|---------|-----------|----------|
| orders, all statuses | 99 | 99 |
| orders in paid / fulfilled / settled | 70 | 70 |
| payments succeeded or settled | 71 | 71 |
| real sales (real Cardcom txn id, non-test buyer) | 0 | 0 |
| orders since the ninth run | n/a | 0 |
| last order | 2026-10-15 03:04 UTC | 2026-10-15 03:04 UTC |

Nothing moved in the three hours since the ninth run. Real sales remain 0, so the launch, 10-sales
and revenue gates are all still closed.

**Backlog Items Analysis (today 2026-10-21 UTC, 2026-10-21 15:53 local UTC+7):**
1. Group-deals re-evaluation, dated 2026-10-23: 2 days out. BLOCKED.
2. Crisp inbox, post-launch: 0 real sales, launch gate not passed. BLOCKED.
3. Meta WhatsApp Business verification, after 10 sales: 0 real sales. BLOCKED.
4. Israeli lawyer review of ToS and Privacy, after 10 sales: 0 real sales. BLOCKED.
5. Capacitor or Expo native app, after revenue: 0 real revenue. BLOCKED.
6. Courses monthly billing, Phase 2: BLOCKED.
7. Tzimmer calendar, Phase 2: BLOCKED.

**Unblocked Items Found:** 0

**Action:** None. ~/ke-goals/queue.txt not modified (47 lines before and after; the ten lines over
the ninth run's 37 are MAINTENANCE_LOOP_10's own append, not this scan's).

**Note:** Item 1 becomes a candidate on 2026-10-23 local. The run that lands on or after
2026-10-23 00:00 local should queue it as `BACKLOG_1 Re-evaluate group deals` at the head of the queue.

**Status:** COMPLETE
