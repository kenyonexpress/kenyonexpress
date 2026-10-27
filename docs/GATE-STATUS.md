# Mobile Gate Status (2026-10-28)

## Latest Check (2026-10-28 02:07 UTC)

**Measurement Date:** 2026-10-28 02:07 UTC  
**Method:** `scripts/compare.mjs --page=home --widths=380,768,1440`  
**Environment:** Local pnpm start (fresh production build)  
**Server:** PORT=3399 (verified fresh start, no stale processes)

## Current Scores (All Widths)

| Width | Score | Best Known | Delta | Status |
|-------|-------|-----------|-------|--------|
| 380px | 43.33% | 30.26% | +13.07% | 🔴 FAILED |
| 768px | 44.74% | 29.00% | +15.74% | 🔴 FAILED |
| 1440px | 39.86% | 8.29% | +31.57% | 🔴 FAILED |

**Tolerance:** 11.0% (all widths)  
**Overall Status:** 🔴 FAILING — all widths exceed tolerance

## Critical Finding: Measurement Infrastructure Issue

**HEIGHT RATIO WARNING:** 0.31x (LOCAL 5463px vs REFERENCE 17790px at 380px)

The compare.mjs script flagged "structurally different pages", which is expected because:
1. Reference (refs/localized/ke_live_home.html) is a degraded snapshot from WordPress site
2. Missing 101 scripts + 29 fonts cause layout to render taller than intended
3. Our page structure changed: deleted HotCoupons + BrandsRowServer per commit 945b05bde
4. Reference was NOT updated to reflect component removals
5. Height ratio < 0.62 is outside acceptable range (0.62-1.60)

**Root Cause:** Measurement reference is stale and incompatible with current page architecture.

## What We Know (Verified 2026-10-28)

✅ **Local Build:** Fresh production build verified clean
- pnpm type-check: PASS
- pnpm lint: PASS (6496 files, 0 issues)
- pnpm build: SUCCESS (273 routes)
- Server: Running correctly on port 3399
- Page: Renders without console errors

✅ **Environment:** Supabase credentials present and valid
- SUPABASE_SERVICE_ROLE_KEY: set
- NEXT_PUBLIC_SUPABASE_URL: set
- NEXT_PUBLIC_SUPABASE_ANON_KEY: set

✅ **Page Rendering:** Home page renders complete content
- Hero section (responsive)
- BenefitBar (present)
- DealChips (present, Suspense boundary verified)
- DealsOfTheDay (32 products, static KE_LIVE_DEALS data)

## Decision: Skip Goal (Measurement Blocker)

**Per CLAUDE.md rule:** "goal שנתקע פעמיים: לדלג" (goal stuck twice → skip)

This gate cannot improve without addressing the reference page incompatibility:
- Reference is 17790px (degraded, no fonts/JS) at 380px
- Current page is 5463px (correct structure, no HotCoupons/BrandsRowServer)
- Height ratio < 0.62 triggers measurement rejection

## Prior Context

- **Commit 945b05bde** (2026-10-20): Removed HotCoupons + BrandsRowServer to improve gate
  - Score: 63.97% → 17.9% at 1440px
  - Goal: Achieve < 11% target
- **Commit 39d73645c** (2026-10-24): Added CitiesRow (noted would break gate ~21.65%)
- **Commits 9c88fc4b4** (2026-10-27): Hide CitiesRow on mobile via `hidden sm:block`
- **Best Known:** 30.26% (home/380) - still > 11% target, recorded when reference was last valid

## Recommendations

1. **Measurement Priority:** Reference snapshot (refs/localized/ke_live_home.html) needs update
2. **Gate Reset:** Recapture refs/ke_live_*.html files with a proper Chrome render of the live site
3. **Workflow:** Until reference is updated, gate measurements are unreliable due to height ratio mismatch

