# M-Cycle Status

**Last Run:** 2026-10-24T05:34:53.537Z
**Mode:** LIVE
**Result:** ❌ CRITICAL FAILURES

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks | 18 |
| Passed | 10 |
| Failed | 8 |
| Skipped | 0 |
| Critical Failures | 1 |

## Task Results

| ID | Task | Status | Duration | Critical |
|----|------|--------|----------|----------|
| M01 | Type Check | ✅ PASS | 3222ms | Yes |
| M02 | Lint Check | ✅ PASS | 2843ms | Yes |
| M03 | Build Test | ✅ PASS | 13590ms | Yes |
| M04 | E2E Health | ✅ PASS | 84ms | No |
| M05 | DB Performance | ⚠️ WARN | 153ms | No |
| M06 | Lighthouse Smoke | ⚠️ WARN | 8291ms | No |
| M07 | Prerender Chunks | ✅ PASS | 158ms | No |
| M08 | Code Debt Scan | ✅ PASS | 402ms | No |
| M09 | Deps Status | ✅ PASS | 30037ms | No |
| M10 | Cron Status | ⚠️ WARN | 204ms | No |
| M11 | Gate Status | ✅ PASS | 68ms | No |
| M12 | Secret Audit | ✅ PASS | 689ms | Yes |
| M13 | Money Constraints | ❌ FAIL | 56ms | Yes |
| M14 | Role Separation | ⚠️ WARN | 55ms | No |
| M15 | Canonical Host | ⚠️ WARN | 5452ms | No |
| M16 | Deployed Build | ✅ PASS | 2327ms | No |
| M17 | Default Branch | ⚠️ WARN | 158ms | No |
| M18 | Backup Health | ⚠️ WARN | 3349ms | No |

## Failed Tasks

### M05: DB Performance

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 153ms

```
❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### M06: Lighthouse Smoke

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 8291ms

```
Runtime error encountered: Chrome prevented page load with an interstitial. Make sure you are testing the correct URL and that the server is properly responding to all requests.
```

### M10: Cron Status

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 204ms

```
    deployed build answers 404 and the alarm goes red on every run it is due.
  CALLED, NOT HERE   wishlist-alerts
    origin/main schedules it; this branch has no such route, so the
    deployed build answers 404 and the alarm goes red on every run it is due.
  CALLED, NOT HERE   wishlist-digest
    origin/main schedules it; this branch has no such route, so the
    deployed build answers 404 and the alarm goes red on every run it is due.

The fix is the mainline decision, not an edit to either list.
See docs/MIGRATION-NUMBER-COLLISIONS.md for the same root cause.
```

### M13: Money Constraints

**Status:** ❌ CRITICAL FAILURE
**Duration:** 56ms

```
audit-money-constraints: no SUPABASE_DB_URL and no --from file.

These four constraints are the ONLY thing standing between a redelivered
Cardcom callback and a second finalisation of a card that was already
charged. Reporting them present without looking would be worse than not
looking, so this refuses.

  node scripts/audit-money-constraints.mjs --sql   # paste through MCP
  node scripts/audit-money-constraints.mjs --from result.json
```

### M14: Role Separation

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 55ms

```
audit-role-separation: no input. Set SUPABASE_DB_URL, or run --sql through the Supabase MCP
  and pass the rows back with --from <file>. This audit will not
  report "no gaps" without having read the database.
```

### M15: Canonical Host

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 5452ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-canonical-host.mjs
```

### M17: Default Branch

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 158ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-default-branch-config.mjs
```

### M18: Backup Health

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 3349ms

```
⚠️  RPO EXCEEDED: Latest backup is 48h old (limit: 23h)
```


## Next Cycle

Expected: 2026-10-24T07:34:53.537Z (2 hours)
