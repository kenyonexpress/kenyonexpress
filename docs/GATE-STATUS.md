# Mobile Gate Status (2026-10-27)

## Latest Check (2026-10-27)

**Measurement Date:** 2026-10-27 19:15 UTC  
**Method:** `scripts/compare.mjs --page=home --widths=380`  
**Environment:** Local pnpm start (fresh build)  

## Current Score

| Metric | Value | Status |
|--------|-------|--------|
| Mobile (380px) | **43.33%** | 🔴 FAILED |
| Tolerance | 11.0% | — |
| Delta | +32.33% | NEEDS FIX |

## Status Summary

🔴 **FAILING** — Mobile gate score of 43.33% exceeds 11% tolerance by 32.33 percentage points.

## Root Cause Analysis

**Issue:** Local home page is loading different content than reference (height ratio 0.30x)

- Reference page height: ~17,790px
- Local page height: ~5,463px  
- Compared: First 2,600px

**Hypothesis:** Data loading failure on local instance

**Evidence:**
- Height ratio 0.30x indicates pages are structurally different
- Script and font failures: reference (101 scripts, 29 fonts) vs local (2 scripts)
- First 2,600px comparison shows 43.33% pixel difference

## Worst Bands (380px viewport)

| Region | Difference | Impact |
|--------|-----------|--------|
| y 2200-2300 | 78.7% | Major |
| y 1700-1800 | 77.2% | Major |
| y 1300-1400 | 76.3% | Major |
| y 1800-1900 | 76.3% | Major |
| y 1100-1200 | 74.9% | Major |

## Action Required

**Mobile fix goal has been requeued** at head of goal queue per MAINTENANCE_LOOP_6.

Next steps:
1. Investigate data loading on local instance
2. Check for Supabase authentication issues
3. Verify API responses match production
4. Re-measure after fix and confirm score < 11%

## Prior Measurements

- **Best known:** 30.26% (home/380) — still above 11% target
- **Cycle 4:** Similar issues with unhydrated scripts
- **Cycle 3:** 39.45% (768px), 30.23% (1440px)

