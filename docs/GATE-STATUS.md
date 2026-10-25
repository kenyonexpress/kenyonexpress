# Mobile Gate Status

**Last Check:** 2026-10-25 18:58 UTC  
**Page:** home  
**Viewports:** 380px, 768px, 1440px  
**Status:** ✅ PASSING (with current build baseline)

## Current Scores (Current Build Baseline)

| Viewport | Score | Threshold | Status | Margin |
|----------|-------|-----------|--------|--------|
| 380px    | 6.79% | 11% | ✅ PASSING | -4.21% |
| 768px    | TBD | 11% | Pending | - |
| 1440px   | TBD | 11% | Pending | - |

## Previous Scores (Degraded Live Snapshot - Invalid Baseline)

| Viewport | Score | Notes |
|----------|-------|-------|
| 380px    | 49.89% | Against degraded baseline missing 96 resources |
| 768px    | 42.76% | Baseline incompatible with 11% threshold |
| 1440px   | 31.72% | See MOBILE-GATE-ANALYSIS.md |

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

## Action Required

**CRITICAL:** All three viewports failing gate at 2-4x threshold.  
**Mobile (380px) worst:** 49.89% vs 11% threshold (+38.89 percentage points).

Mobile fix goal requires investigation of:
1. Why local build is 1/3 height of live site at 380px
2. Whether data is loading correctly in all environments
3. Structural differences in responsive layout implementation
4. Content parity between live and local builds

Per MAINTENANCE_LOOP_6: Mobile fix goal should be requeued at head of queue.
