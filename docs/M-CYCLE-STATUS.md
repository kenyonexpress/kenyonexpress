# M-Cycle Status

**Last Run:** 2026-10-24T07:37:22.894Z
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
| M01 | Type Check | ✅ PASS | 14299ms | Yes |
| M02 | Lint Check | ✅ PASS | 5644ms | Yes |
| M03 | Build Test | ✅ PASS | 42923ms | Yes |
| M04 | E2E Health | ✅ PASS | 193ms | No |
| M05 | DB Performance | ⚠️ WARN | 348ms | No |
| M06 | Lighthouse Smoke | ⚠️ WARN | 19512ms | No |
| M07 | Prerender Chunks | ✅ PASS | 737ms | No |
| M08 | Code Debt Scan | ✅ PASS | 1035ms | No |
| M09 | Deps Status | ✅ PASS | 30048ms | No |
| M10 | Cron Status | ⚠️ WARN | 422ms | No |
| M11 | Gate Status | ✅ PASS | 319ms | No |
| M12 | Secret Audit | ✅ PASS | 1876ms | Yes |
| M13 | Money Constraints | ❌ FAIL | 245ms | Yes |
| M14 | Role Separation | ⚠️ WARN | 298ms | No |
| M15 | Canonical Host | ⚠️ WARN | 6818ms | No |
| M16 | Deployed Build | ✅ PASS | 3618ms | No |
| M17 | Default Branch | ⚠️ WARN | 556ms | No |
| M18 | Backup Health | ⚠️ WARN | 5893ms | No |

## Failed Tasks

### M05: DB Performance

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 348ms

```
❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### M06: Lighthouse Smoke

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 19512ms

```
Runtime error encountered: Chrome prevented page load with an interstitial. Make sure you are testing the correct URL and that the server is properly responding to all requests.
```

### M10: Cron Status

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 422ms

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
**Duration:** 245ms

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
**Duration:** 298ms

```
audit-role-separation: no input. Set SUPABASE_DB_URL, or run --sql through the Supabase MCP
  and pass the rows back with --from <file>. This audit will not
  report "no gaps" without having read the database.
```

### M15: Canonical Host

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 6818ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-canonical-host.mjs
```

### M17: Default Branch

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 556ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-default-branch-config.mjs
```

### M18: Backup Health

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 5893ms

```
⚠️  RPO EXCEEDED: Latest backup is 50h old (limit: 23h)
```


## Next Cycle

Expected: 2026-10-24T09:37:22.895Z (2 hours)
