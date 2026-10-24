# M-Cycle Status

**Last Run:** 2026-10-24T05:30:15.335Z
**Mode:** LIVE
**Result:** ❌ CRITICAL FAILURES

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks | 18 |
| Passed | 9 |
| Failed | 9 |
| Skipped | 0 |
| Critical Failures | 2 |

## Task Results

| ID | Task | Status | Duration | Critical |
|----|------|--------|----------|----------|
| M01 | Type Check | ✅ PASS | 3369ms | Yes |
| M02 | Lint Check | ❌ FAIL | 2496ms | Yes |
| M03 | Build Test | ✅ PASS | 25025ms | Yes |
| M04 | E2E Health | ✅ PASS | 82ms | No |
| M05 | DB Performance | ⚠️ WARN | 82ms | No |
| M06 | Lighthouse Smoke | ⚠️ WARN | 12621ms | No |
| M07 | Prerender Chunks | ✅ PASS | 216ms | No |
| M08 | Code Debt Scan | ✅ PASS | 399ms | No |
| M09 | Deps Status | ✅ PASS | 30039ms | No |
| M10 | Cron Status | ⚠️ WARN | 119ms | No |
| M11 | Gate Status | ✅ PASS | 58ms | No |
| M12 | Secret Audit | ✅ PASS | 751ms | Yes |
| M13 | Money Constraints | ❌ FAIL | 59ms | Yes |
| M14 | Role Separation | ⚠️ WARN | 59ms | No |
| M15 | Canonical Host | ⚠️ WARN | 4530ms | No |
| M16 | Deployed Build | ✅ PASS | 2447ms | No |
| M17 | Default Branch | ⚠️ WARN | 143ms | No |
| M18 | Backup Health | ⚠️ WARN | 1758ms | No |

## Failed Tasks

### M02: Lint Check

**Status:** ❌ CRITICAL FAILURE
**Duration:** 2496ms

```
    197     │ - ········'utf8',
    198     │ - ······)
        192 │ + ······const·docContent·=·fs.readFileSync(path.join(projectRoot,·'docs',·'M-CYCLE.md'),·'utf8')
    199 193 │   
    200 194 │         expect(docContent).toContain('./scripts/start-m-cycle-tmux.sh')
  

check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  × Some errors were emitted while running checks.
```

### M05: DB Performance

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 82ms

```
❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### M06: Lighthouse Smoke

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 12621ms

```
Runtime error encountered: Chrome prevented page load with an interstitial. Make sure you are testing the correct URL and that the server is properly responding to all requests.
```

### M10: Cron Status

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 119ms

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
**Duration:** 59ms

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
**Duration:** 59ms

```
audit-role-separation: no input. Set SUPABASE_DB_URL, or run --sql through the Supabase MCP
  and pass the rows back with --from <file>. This audit will not
  report "no gaps" without having read the database.
```

### M15: Canonical Host

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 4530ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-canonical-host.mjs
```

### M17: Default Branch

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 143ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-default-branch-config.mjs
```

### M18: Backup Health

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 1758ms

```
⚠️  RPO EXCEEDED: Latest backup is 48h old (limit: 23h)
```


## Next Cycle

Expected: 2026-10-24T07:30:15.335Z (2 hours)
