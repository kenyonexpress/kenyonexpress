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
