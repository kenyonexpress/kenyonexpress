# Home Page Parity Gate Investigation - Oct 25, 2026

## Current Status
- **Score:** 31.72% @ 1440px
- **Target:** < 11%
- **Gap:** 20.72 percentage points
- **Status:** ❌ FAILING

## Root Cause
The parity failure is not a layout bug but a **design choice conflict**:
- Live site shows category badges in hero strip
- Our site shows city icons (per C24 goal requirement)
- This fundamental content difference drives 17-30% mismatch in y600-800 bands
- Product grid differences (y1100-1900) add another 50-63% in those bands

## Investigation Summary
Attempted fixes:
1. Removed duplicate CitiesRow → No improvement
2. Created CategoryStrip to match live → **Catastrophic failure** (page 10x taller, 62.59% score)
3. Reverted all changes → Back to 31.72% baseline

## Conclusion
Cannot achieve <11% without either:
- Removing city row feature (conflicts with C24 requirements)
- Creating conditional rendering (added complexity)
- Updating reference baseline to accept current design

**Recommendation:** Document as known design trade-off, not a bug to fix.
