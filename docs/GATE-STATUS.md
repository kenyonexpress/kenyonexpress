# Gate Status Report

## Mobile Gate Score (2026-10-26 09:25 UTC+7)

**Test:** scripts/compare.mjs --page=home --widths=380  
**Threshold:** ≤ 11.00%  
**Current Score:** 12.83%  
**Status:** 🔴 ABOVE THRESHOLD

### Worst Bands (Top Issues)
| Y Range | Score | Severity |
|---|---|---|
| 200-300px | 55.3% | 🔴 Critical |
| 1700-1800px | 45.0% | 🔴 Critical |
| 300-400px | 33.1% | 🔴 Critical |
| 1800-1900px | 26.1% | 🔴 High |
| 100-200px | 18.6% | 🔴 High |

### Root Causes
The reference (live site) has 96 failed to load (57 script, 37 font), while our build has only 3 failures. The worst pixel bands indicate critical visual discrepancies in the hero section (y 200-300) and middle content areas (y 1700-1800).

### Action Required
Mobile gate score exceeded threshold. A mobile UI fix goal has been queued to the head of the goal queue.

**Next Steps:**
1. Investigate hero section layout (y 200-300)
2. Debug middle content rendering (y 1700-1800)
3. Verify font/CSS loading differences between live and local
4. Re-run gate after fixes

---

**Previous Pass:** 2026-10-25 (last passing measurement if available)
