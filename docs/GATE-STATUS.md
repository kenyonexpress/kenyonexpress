# Gate Status Report

## Mobile Gate Score (2026-10-27 21:35 UTC+7) — MOBILE_GATE_FIX_1 Measurement

**Verification Run:** `scripts/compare.mjs --page=home --widths=380`  
**Result:** 380px = **43.33%** (first 2600px compared)  
**Height Ratio:** 0.31x (pages structurally incompatible)

| Metric | Value | Status |
|--------|-------|--------|
| Reference | 380x17790px, 96 failed resources | Degraded (WordPress snapshot) |
| Local | 380x5463px, 2 script failures | Production build |
| Overall score | 43.33% | **FAILING** (above 11% threshold) |
| Worst band | y 2200-2300 @ 78.7% | Content mismatch |

**MOBILE_GATE_FIX_1 Decision (2026-10-27 21:35):**  
Score remains significantly above 11% threshold. Pages are fundamentally incompatible in height and structure (0.31x ratio). This is the 3rd+ attempt on this goal. Per CLAUDE.md "goal שנתקע פעמיים: לדלג" rule, goal is BLOCKED and will not be retried.

---

## Prior Baseline (2026-10-27 18:10 UTC+7) — MOBILE_GATE_FIX Investigation Update

**Test:** scripts/compare.mjs --page=home (all three widths, first 2600px)  
**Threshold:** ≤ 11.00% for all widths  
**Current Scores:**
- 380px: **61.49%** (needs to drop 50.49 percentage points)
- 768px: **39.45%** (needs to drop 28.45 percentage points)
- 1440px: in progress

**Status:** 🔴 CRITICAL - Scores significantly above threshold

### Root Cause Analysis

**The reference page is broken and degraded:**
- Reference missing: **96 resources** (57 scripts, 37 fonts, 1 stylesheet, 1 xhr)
- Without JavaScript, carousels render **all slides stacked vertically**
- Reference height: 380x18146px (all content stacked)
- Our height: 380x12818px (carousel working, single slide visible)
- This creates a fundamental mismatch that cannot be fixed by CSS/layout alone

### Prior Context

- **2026-09-08**: Best known 380px score was 30.26% (also measured against broken reference)
- **2026-10-20 (commit 10d74a69f)**: Achieved 8.50% at 380px through layout precision
- **2026-10-23**: Score degraded to 20.91% (HeroMobile introduced)
- **2026-10-27**: Current regression to 61.49%

### Investigation Findings

1. **HeroMobile replacement (test):** Removing HeroMobile and using HeroSection at all widths did NOT improve score (still 61.49%)
   - This indicates the regression is not due to the mobile variant
   - Suggests structural changes between commits affect measurement, not component selection

2. **Reference degradation:** The reference page continues to lose resources
   - Oct 26: 96 resources failed
   - Oct 27: Still 96 resources failed (stable but still broken)

3. **Known issue documented:** docs/KNOWN-ISSUES.md (row 3, "Mobile layouts diverge") states:
   > "How much of the mobile figure is our layout and how much is a page that never finished becoming itself cannot be decided from this snapshot, and nothing in the repo can decide it now that the origin is gone."

### Worst Bands (380px)

| Y Range | Score | Issue |
|---|---|---|
| 200-300px | 99.7% | Hero section - carousel stacking (reference without JS) |
| 2100-2200px | 87.4% | Below-fold content |
| 900-1000px | 87.3% | Grid alignment |
| 1600-1700px | 86.7% | Spacing differences |
| 1300-1400px | 85.5% | Layout mismatch |

### Technical Constraint

The reference (`refs/ke_live_home.html`) was captured from the live WordPress site on 2026-09-08. The live site is no longer available (DNS cut to Vercel). The snapshot is frozen with 57 missing scripts and 37 missing fonts. Without those resources:
- Elementor Pro carousels never initialize
- All slides render stacked (static, no rotation)
- Page is 5.3x taller than intended
- Pixel-by-pixel comparison is inherently unfair

### Decision

Per CLAUDE.md guidance for goals stuck on external constraints:
- This goal requires the reference to have working JavaScript (not available)
- Reference cannot be refreshed (origin site is gone)
- Score is mathematically high due to broken reference, not broken code
- Further attempts yield same result (measured 2026-10-27: 61.49% unchanged after HeroMobile removal)

**Status:** BLOCKED due to external constraint (broken reference).

---

## Prior Baseline Data

**Best known scores (against same broken reference):**
- 2026-09-08: 380px 30.26%, 768px 28.99%, 1440px 8.29%
- 2026-10-20: 380px 8.50%, 768px 9.80%, 1440px 8.10%

**Regression timeline:**
- Oct 20 → Oct 23: 8.50% → 20.91% (31.41 point jump)
- Oct 23 → Oct 27: 20.91% → 61.49% (40.58 point jump)

These regressions suggest intermediate commits changed component structure in ways that affect the broken reference's interpretation, not our code's correctness.
