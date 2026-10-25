# Mobile Gate Status

**Last Check:** 2026-10-25 19:15 UTC  
**Page:** home  
**Viewports:** 380px, 768px, 1440px  
**Status:** ❌ FAILING (all viewports above 11% threshold)

## Current Scores (Valid Baselines)

### Electro v7 Template Baseline
| Viewport | Score | Threshold | Status | Over Threshold |
|----------|-------|-----------|--------|----------------|
| 380px    | 47.64% | 11% | ❌ FAILING | +36.64% |
| 768px    | 41.3% | 11% | ❌ FAILING | +30.3% |
| 1440px   | 29.65% | 11% | ❌ FAILING | +18.65% |

### Degraded Live Snapshot Baseline
| Viewport | Score | Notes |
|----------|-------|-------|
| 380px    | 49.89% | Missing 96 resources (37 fonts, 57 scripts) |
| 768px    | 42.76% | Degraded baseline |
| 1440px   | 31.72% | Degraded baseline |

## Comparison Details

### 380px Viewport
- **Live:** 380x17790px
- **Local:** 380x5433px
- **Compared:** 380x2600px (first segment)
- **Best Known:** 30.26% (tolerance: 0.5%)
- **Height Ratio:** 0.31x (structurally different pages)

**Worst Performing Bands:**
1. y 200-300: **99.7%** (critical variance)
2. y 1800-1900: **78.9%** (severe variance)
3. y 2200-2300: **78.9%** (severe variance)
4. y 1200-1300: **76.8%** (severe variance)
5. y 1700-1800: **75.6%** (severe variance)

### 768px Viewport
- **Live:** 768x9152px
- **Local:** 768x8712px
- **Compared:** 768x2600px (first segment)
- **Best Known:** 29% (tolerance: 0.5%)

**Worst Performing Bands:**
1. y 1000-1100: **70.2%** (severe variance)
2. y 1200-1300: **70.2%** (severe variance)
3. y 1400-1500: **69%** (severe variance)
4. y 1600-1700: **67.9%** (severe variance)
5. y 1900-2000: **67.3%** (severe variance)

### 1440px Viewport
- **Live:** 1440x5492px
- **Local:** 1440x5372px
- **Compared:** 1440x2600px (first segment)
- **Best Known:** 8.29% (tolerance: 0.5%)

**Worst Performing Bands:**
1. y 1800-1900: **63.5%** (severe variance)
2. y 1200-1300: **59.9%** (severe variance)
3. y 1300-1400: **59.5%** (severe variance)
4. y 1100-1200: **58.7%** (severe variance)
5. y 1400-1500: **50.1%** (large variance)

## Resource Loading

- **Reference (live):** 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr)
- **Local:** Everything loaded successfully

## Root Cause Analysis

### 380px Critical Issue
The height ratio of 0.31x indicates the local build renders at approximately 1/3 the height of the live site. This suggests:
1. Major structural differences between builds (NOT just styling)
2. Possible data loading failures on local build
3. Missing content sections or components

The script output warns: "These are structurally different pages, not the same page styled differently."

### Common Issues Across All Viewports
- Large variance concentrated in mid-page vertical bands (y 1000-2400px)
- Reference site has significant resource loading failures (96 resources)
- Local build loads all resources successfully but renders shorter content

## Investigation Results (2026-10-25)

**Target:** Reduce 1440px score from 31.72% to below 11%  
**Outcome:** Unable to achieve target without design changes  
**All checks passed:** ✓ type-check, ✓ lint, ✓ build

### Attempted Fixes
1. **Removed duplicate CitiesRow** from page.tsx → No improvement (31.72% unchanged)
2. **Created CategoryStrip** to match live site categories → **FAILED** (page broke, 62.59%, 10x height)
3. **Reverted all changes** → Back to 31.72% baseline

### Root Cause
**Design Conflict:** C24 goal explicitly requested city row feature, but live reference shows category badges in hero strip (y600-800). This fundamental content mismatch drives 17-30% variance in those bands. Product grid differences (y1100-1900) add 50-63% variance.

**Cannot fix without:**
- Removing city row (conflicts with C24 requirements)
- Conditional rendering (significant complexity)
- Updating reference baseline

### Current State
- All tests passing
- Code quality gates: ✓ tokens, ✓ copy, ✓ assets  
- Score: 31.72% (23.43 points above threshold)
- **Recommendation:** Document as known design trade-off, not a bug

## Action Required

**CRITICAL:** All three viewports failing gate at 2-4x threshold.  
**1440px:** 31.72% vs 11% threshold - design conflict identified  
**Mobile (380px) worst:** 49.89% vs 11% threshold (+38.89 percentage points).

Mobile fix goal requires investigation of:
1. Why local build is 1/3 height of live site at 380px
2. Whether data is loading correctly in all environments
3. Structural differences in responsive layout implementation
4. Content parity between live and local builds
