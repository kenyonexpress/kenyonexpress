# Mobile Gate Status

**Last Check:** 2026-10-25 23:55 UTC  
**Page:** home  
**Viewport:** 380px (mobile)  
**Current Score:** 50.62%  
**Threshold:** 11%  
**Status:** ❌ FAILING (39.62% over threshold)

## Comparison Results

- **Live:** 380x18146px
- **Local:** 380x5151px
- **Compared:** 380x2600px (first segment)
- **Best Known:** 30.26% (tolerance: 0.5%)

**HEIGHT RATIO:** 0.28x — Local build renders at approximately 1/3 the height of live site, indicating structural differences, not just styling variance.

## Worst Performing Bands

1. y 200-300: **99.7%** (critical variance)
2. y 1100-1200: **82.2%** (severe variance)
3. y 1700-1800: **79.4%** (severe variance)
4. y 700-800: **78.6%** (severe variance)
5. y 1800-1900: **75.1%** (severe variance)

## Resource Loading

- **Reference (live):** 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr)
- **Local:** 4 failed to load, all expected on a local origin

## Root Causes

The extreme height ratio (0.28x) indicates these are structurally different pages:
1. Local page may have failed to load data and rendered a fallback
2. Missing content sections or components
3. Server logs show no database errors, but content parity issues remain

Server fresh (BUILD_ID: Emu3JIx56cghdPOyQBKwB), no supabase.admin_key_invalid errors.

## Action Required

Gate FAILING at 50.62% (threshold 11%, +39.62% over).  
Mobile fix goal requeued at head of queue per MAINTENANCE_LOOP_6.  
**Priority:** Critical structural difference investigation required.
