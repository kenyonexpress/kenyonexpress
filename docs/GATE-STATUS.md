# Mobile Gate Status — Measurement Attempts 2026-10-20

## Summary Status: BLOCKED (Attempt 2 of 2)

The mobile gate baseline (`refs/localized/ke_live_home.html`) is missing and unrecoverable. Two measurement approaches attempted:

1. **Attempt 1:** Use `refs/localized/` (missing) → Failed with "refs/localized/ke_live_home.html is missing"
2. **Attempt 2:** Fallback to Electro reference → Produced score but invalid for gate purposes

## Measurement Infrastructure Failure

### Missing Baseline Files (Unrecoverable)
```
refs/ke_live_*.html        ❌ MISSING (original WordPress snapshots)
refs/live-assets/          ❌ MISSING (crawled asset cache)  
refs/localized/            ❌ CANNOT BE REBUILT
```

**Why Unrecoverable:**
- Files are `.gitignore`'d (never committed to git)
- Source files lost (not in backups, not in codebase)
- Production now serves our app (cannot recapture from live)
- No external archive available

### Fallback Attempt: Electro Measurement

**Score (380px):** 45.86%  
**Against:** refs/electro_home.html (design template)  
**Height Ratio:** 1.95x (structurally incompatible pages)

**Why This Score is Invalid:**
- Electro is a different website (design template, not storefront)
- Script warning: "HEIGHT RATIO 1.95x — the percentage above is NOT a pixel gate"
- Pages are "structurally different, not the same page styled differently"
- Does NOT represent actual mobile gate fidelity

**The mobile gate measures against the original WordPress site.**  
Electro measurement is a workaround, not a valid gate result.

## Previous Measurement (Historical)
**Last valid measurement:** 37.44% (2026-10-18 01:44 UTC) — but refs had resource failures even then

## Autonomous Decision

**Goal condition cannot be satisfied:**
- ✓ Can measure against arbitrary baseline (45.86%)
- ✗ Cannot measure against the actual mobile gate baseline (WordPress)
- ✗ Baseline infrastructure is unrecoverable without external intervention

**Marked as BLOCKED — Attempt 2 of 2**

Per CLAUDE.md "goal stuck twice: skip" rule, this goal will be skipped on next execution.

## Unblocking Requirements

To measure the actual mobile gate:
1. **Restore refs/ke_live_*.html** from external backup (original WordPress snapshots)
2. **Restore refs/live-assets/** from external backup (image asset cache)
3. **Run** `scripts/localize-live-refs.mjs` to rebuild `refs/localized/`
4. **Re-run** `scripts/compare.mjs --page=home --width=380`

Without these files, measurement is impossible.
