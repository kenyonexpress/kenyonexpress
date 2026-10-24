# M-Cycle Status

**Last Run:** 2026-10-24T11:40:28.347Z
**Mode:** LIVE
**Result:** ❌ CRITICAL FAILURES

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks | 18 |
| Passed | 11 |
| Failed | 7 |
| Skipped | 0 |
| Critical Failures | 1 |

## Task Results

| ID | Task | Status | Duration | Critical |
|----|------|--------|----------|----------|
| M01 | Type Check | ✅ PASS | 30229ms | Yes |
| M02 | Lint Check | ✅ PASS | 9054ms | Yes |
| M03 | Build Test | ✅ PASS | 25569ms | Yes |
| M04 | E2E Health | ✅ PASS | 128ms | No |
| M05 | DB Performance | ⚠️ WARN | 139ms | No |
| M06 | Lighthouse Smoke | ⚠️ WARN | 13157ms | No |
| M07 | Prerender Chunks | ✅ PASS | 294ms | No |
| M08 | Code Debt Scan | ✅ PASS | 218ms | No |
| M09 | Deps Status | ✅ PASS | 1893ms | No |
| M10 | Cron Status | ⚠️ WARN | 124ms | No |
| M11 | Gate Status | ✅ PASS | 67ms | No |
| M12 | Secret Audit | ✅ PASS | 748ms | Yes |
| M13 | Money Constraints | ❌ FAIL | 110ms | Yes |
| M14 | Role Separation | ⚠️ WARN | 105ms | No |
| M15 | Canonical Host | ⚠️ WARN | 5299ms | No |
| M16 | Deployed Build | ✅ PASS | 2700ms | No |
| M17 | Default Branch | ⚠️ WARN | 173ms | No |
| M18 | Backup Health | ✅ PASS | 1317ms | No |

## Failed Tasks

### M05: DB Performance

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 139ms

```
❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### M06: Lighthouse Smoke

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 13157ms

```
Runtime error encountered: Chrome prevented page load with an interstitial. Make sure you are testing the correct URL and that the server is properly responding to all requests.
```

### M10: Cron Status

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 124ms

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
**Duration:** 110ms

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
**Duration:** 105ms

```
audit-role-separation: no input. Set SUPABASE_DB_URL, or run --sql through the Supabase MCP
  and pass the rows back with --from <file>. This audit will not
  report "no gaps" without having read the database.
```

### M15: Canonical Host

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 5299ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-canonical-host.mjs
```

### M17: Default Branch

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 173ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-default-branch-config.mjs
```


## Next Cycle

Expected: 2026-10-24T13:40:28.347Z (2 hours)
