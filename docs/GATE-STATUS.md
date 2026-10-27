# Gate Status Report

## Mobile Gate (380px) - MOBILE_GATE_FIX SKIPPED

**Date:** 2026-10-27 11:40 UTC+7
**Score:** 45.49% (OVERALL first 2600px) — ABOVE 11% THRESHOLD
**Status:** ⏭️ SKIPPED — Architecturally unfixable, per CLAUDE.md "goal stuck twice: skip" rule

### Fresh Measurement (2026-10-27)
- **Overall score:** 45.49% (first 2600px compared)
- **Reference (WordPress):** 380x17790px
- **Local (Next.js):** 380x5446px
- **HEIGHT RATIO:** 0.31x (pages are structurally incompatible, not styling issue)
- **Reference failed resources:** 96 (57 script, 37 font, 1 stylesheet, 1 xhr)
- **Local failed resources:** 0 (everything loaded successfully)

### Worst bands (this measurement):
  - y 2200-2300: 78.4%
  - y 1800-1900: 77.8%
  - y 1700-1800: 76.3%

### Root Cause Analysis
1. **Reference is degraded:** WordPress snapshot missing 96 resources (scripts won't run, fonts didn't load)
2. **Reference is incompatible:** Old WordPress site ≠ New Next.js app (different structure, content, layout)
3. **Cannot regenerate reference:** Original WordPress site no longer exists at kenyonexpress.co.il (now serves our Next.js build)
4. **Height difference is unfixable:** Local at 5446px vs reference at 17790px indicates fundamental structural mismatch

### Prior Attempts
- Previous session (2026-10-26 to 2026-10-27): Three separate fix attempts (BenefitBar height classes, CitiesRow hiding, hero CSS changes) — all resulted in NO IMPROVEMENT (locked at 61.49% → 45.49% current)
- Previous investigation documented in STATE.md lines 394-457

### Decision
Per CLAUDE.md rule: "goal שנתקע פעמיים: לדלג" (skip after two failures, never try third time)
- Attempt 1: 2026-10-26 (fixed width overflow, gate still above 11%)
- Attempt 2: 2026-10-26 (various CSS/layout fixes, no improvement)
- Attempt 3: 2026-10-27 (this session, fresh measurement shows incompatible heights)

**SKIPPED:** No further retry authorized. Requires external intervention (regenerate reference or switch baseline to Electro v7 template).

### Recommendation for Owner
Choose one of three paths:
1. **Regenerate reference** from original WordPress (currently inaccessible)
2. **Switch baseline** to Electro v7 template (architectural change to compare.mjs)
3. **Accept gate as deprecated** (measurement against old WordPress no longer valid)
