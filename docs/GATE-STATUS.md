# Gate Status Report

## Measurement Date
2026-10-20 01:20 UTC

## Gate Threshold
All compare.mjs measurements must remain below **11%** deviation from the live reference.

## Current Status: ⚠️ ABOVE THRESHOLD - BOTH WIDTHS MEASURED

### Home Page (Latest Measurements)
- **1440px: 31.77%** ❌ EXCEEDS 11% by 20.77 points
- **380px: 40.57%** ❌ EXCEEDS 11% by 29.57 points
  - Height mismatch detected: Reference 17790px vs Local 7320px (0.41x ratio)
  - Warning: Pages structurally different (older reference may lack JavaScript initialization)

### Comparison Details
- Live reference: refs/localized/ke_live_home.html (snapshot from live site)
- Local build: http://localhost:3311/
- Measured area: First 2600px of viewport
- Failed asset loads: 96 (live) vs 5 (local) - expected reference assets offline

### Known Issues Affecting Gate
1. **Layout shifts**: Significant pixel differences in product cards and hero sections
2. **Typography rendering**: Font loading and rendering differences between reference snapshot and current build
3. **CSS/styling**: Multiple band areas above 50% difference (y:1100-1200 = 58.6%, y:2400-2500 = 65%)

### Assessment
- **Mobile gate score**: Unable to measure (380px timeout - measurement took >120s)
- **Overall gate status**: RED - Home page at 31.77% is 188% over tolerance
- **Action required**: Mobile fix goal should be requeued at head of queue

### Next Steps
1. Investigate why compare script takes >120s at 380px viewport
2. Profile layout shifts on mobile viewport
3. Identify and fix CSS/styling discrepancies
4. Re-measure after fixes to verify below 11%

---

## Measurement Conditions
- Server: pnpm start on port 3311
- Browser: Chromium (Playwright)
- Viewport height: 2600px (fixed for band alignment)
- Comparison method: Pixel-difference banding algorithm
