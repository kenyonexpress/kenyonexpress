# M-Cycle Status

**Last Run:** 2026-11-03T09:39:32.137Z
**Mode:** LIVE
**Result:** ⚠️ NON-CRITICAL FAILURES

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks | 18 |
| Passed | 15 |
| Failed | 3 |
| Skipped | 0 |
| Critical Failures | 0 |

## Task Results

| ID | Task | Status | Duration | Critical |
|----|------|--------|----------|----------|
| M01 | Type Check | ✅ PASS | 9704ms | Yes |
| M02 | Lint Check | ✅ PASS | 11355ms | Yes |
| M03 | Build Test | ✅ PASS | 58965ms | Yes |
| M04 | E2E Health | ✅ PASS | 6379ms | No |
| M05 | DB Performance | ✅ PASS | 7638ms | No |
| M06 | Lighthouse Smoke | ✅ PASS | 142917ms | No |
| M07 | Prerender Chunks | ✅ PASS | 700ms | No |
| M08 | Code Debt Scan | ✅ PASS | 992ms | No |
| M09 | Deps Status | ✅ PASS | 30018ms | No |
| M10 | Cron Status | ⚠️ WARN | 257ms | No |
| M11 | Gate Status | ✅ PASS | 152ms | No |
| M12 | Secret Audit | ✅ PASS | 3420ms | Yes |
| M13 | Money Constraints | ✅ PASS | 10469ms | Yes |
| M14 | Role Separation | ✅ PASS | 8311ms | No |
| M15 | Canonical Host | ⚠️ WARN | 12417ms | No |
| M16 | Deployed Build | ✅ PASS | 7681ms | No |
| M17 | Default Branch | ⚠️ WARN | 302ms | No |
| M18 | Backup Health | ✅ PASS | 4109ms | No |

## Failed Tasks

### M10: Cron Status

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 257ms

```
HERE, NEVER CALLED  cashback-settlement
    this branch defines the job and origin/main does not schedule it,
    so it has never run. No alarm fires: a job nobody scheduled is silent.
  HERE, NEVER CALLED  push-voucher-expiry
    this branch defines the job and origin/main does not schedule it,
    so it has never run. No alarm fires: a job nobody scheduled is silent.

The fix is the mainline decision, not an edit to either list.
See docs/MIGRATION-NUMBER-COLLISIONS.md for the same root cause.
```

### M15: Canonical Host

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 12417ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-canonical-host.mjs
```

### M17: Default Branch

**Status:** ⚠️ NON-CRITICAL FAILURE
**Duration:** 302ms

```
Command failed: node /Users/ofir/kenyonexpress-web/kenyonexpress/scripts/audit-default-branch-config.mjs
```


## Next Cycle

Expected: 2026-11-03T11:39:32.137Z (2 hours)
