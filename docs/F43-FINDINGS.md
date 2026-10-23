# F43 Mobile Gate Analysis (2026-10-23)

## Goal
Fix Mobile Gate 380px to under 11% diff vs `refs/electro-home-v7.html`. Current 39.31%, historical best 30.24%.

## Current Measurement

```
=== compare --page=home --baseline=electro-home-v7_380.png ===
live: 380x8792  mine: 380x6196
compared: 380x2600
OVERALL first 2600px: 39.31%
parity: WORSE than the 30.26% best known for home/380 (tolerance 0.5)

Worst bands:
  y 1900-2000  85.2%
  y 1200-1300  81.9%
  y  900-1000  81.1%
  y  600-700   64.6%
  y 1800-1900  63.8%
  y    0-100   60.4%
```

## Key Findings

### 1. Known Hard Problem
Per `docs/MOBILE-AUDIT.md`:
> "Home at 380 against the frozen WordPress reference is 30.24% (the gate is 11%). KNOWN-ISSUES 3: **a structural mobile layout project, not a tuning pass.**"

### 2. Historical Context
- Best known score: **30.26%** (documented in UI-PARITY-REPORT.md)
- Current score: **39.31%** (9% regression)
- Target: **<11%** (unachieved in all prior attempts)
- Last measurement before this: 20.46% at 1440px, but 380px measurements rare

### 3. Height Mismatch
- Reference page: 8792px tall
- Our page: 6196px tall  
- **Missing 2596px of content** (~4-5 cards at 549px pitch)
- Only first 2600px compared (where worst bands are)

### 4. Layout Structure
Current mobile stack (380px):
```
Hero Section:        213px (h-hero-mobile)
Benefit Bar:          31px (hidden items, empty strip)
Deals padding top:     3px
Product cards:    32 × ~550px each
```

### 5. Reference vs Ours
**Reference** (Electro WordPress theme):
- Complex multi-section layout
- Different platform, different rendering
- Measured first card at y443 (ours starts earlier at ~247px)

**Ours** (Next.js):
- Simpler structure
- Static prerendering
- Already optimized for performance

### 6. Regression Analysis
Checked commits since last good measurement:
- F01 (2130a5bc4): Only color token changes, no layout impact
- F08 (9e84c5b29): Personal area - need to verify if it affected home

## Structural Barriers to <11%

1. **Platform Difference**: WordPress/Electro vs Next.js = fundamentally different rendering
2. **Content Parity**: Reference has different products, images, content
3. **RTL vs LTR**: Reference is LTR English, ours is RTL Hebrew
4. **Mobile Layout**: Reference has specific mobile patterns we don't replicate
5. **Component Structure**: Would need complete rebuild of cards/hero/categories for mobile

## Recommendations

### Short Term (This Session)
1. ❌ Achieving <11% is not realistic given history and structural issues
2. ✅ Focus on understanding and fixing the 9% regression (39% → 30%)
3. ✅ Document findings for future attempts
4. ✅ Make targeted fixes if obvious issues found

### Long Term (Future Project)
1. Consider accepting a higher threshold (e.g., <20%) for mobile
2. OR: Complete mobile layout rebuild with different component structure
3. OR: Use a different baseline that's more achievable
4. Document that Electro parity at 380px may not be a realistic goal

## Next Steps
1. Identify what caused regression from 30% to 39%
2. Fix any obvious layout issues
3. Re-measure to confirm
4. Update STATE.md with honest assessment
