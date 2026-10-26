# Gate Status Report

## Mobile Gate Score (2026-10-26 04:25 UTC)

**Test:** scripts/compare.mjs --page=home --widths=380  
**Threshold:** ≤ 11.00%  
**Current Score:** 50.62% (first 2600px)  
**Status:** 🔴 CRITICAL - STRUCTURAL DIFFERENCE

### Page Structure Mismatch
- Reference (live): 380x18146px
- Local: 380x5151px
- **Height Ratio:** 0.28x — pages are structurally different

### Worst Bands (Top Issues)
| Y Range | Score | Severity |
|---|---|---|
| 200-300px | 99.7% | 🔴 CRITICAL |
| 1100-1200px | 82.2% | 🔴 Critical |
| 1700-1800px | 79.4% | 🔴 Critical |
| 700-800px | 78.6% | 🔴 Critical |
| 1800-1900px | 75.1% | 🔴 Critical |

### Root Causes
1. **Stale server or failed build** - Local page is 28% of live height
2. **Database query failures** - Product data may not be loading
3. **Failed resources** - Reference has 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr)

### Action Required
Mobile gate score exceeded threshold. A mobile UI fix goal has been queued to the head of the goal queue.

**Next Steps:**
1. Investigate hero section layout (y 200-300)
2. Debug middle content rendering (y 1700-1800)
3. Verify font/CSS loading differences between live and local
4. Re-run gate after fixes

---

**Previous Pass:** 2026-10-25 (last passing measurement if available)
