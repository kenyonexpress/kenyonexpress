# Mobile Gate Status — Measurement Complete 2026-10-20

## ✅ FRESH MEASUREMENT OBTAINED

**Mobile Gate Score (380px):** 37.15% — **FAIL** (above 11% threshold)

**Measurement Details:**
- **Date/Time:** 2026-10-20 04:47 UTC
- **Baseline:** refs/localized/ke_live_home.html (restored from ke-rc5 worktree)
- **Width:** 380px (mobile)
- **Server:** localhost:3000 (pnpm start)
- **Difference:** 37.15% of first 2600px pixels mismatched

**Measurement Quality:**
- Reference page loaded successfully: 380x17790 pixels
- Local page loaded: 408x16981 pixels
- Compared: first 2600px (standard gate window)
- Some resource failures in reference (113 scripts failed) — expected for archived WordPress page

**Worst Performing Bands (y-axis):**
- y 2200-2300: 89.6% diff
- y 2100-2200: 88.5% diff
- y 1600-1700: 79.1% diff
- y 1500-1700: ~74-79% diff

**Threshold Status:**
- Mobile gate threshold: **11%**
- Measured score: **37.15%**
- **Gap: +26.15% above acceptable** ✗ FAIL

**Action Taken:**
✅ **Mobile Fix Goal REQUEUED at head of work queue** per goal condition met.

## How Baseline Was Recovered

The baseline files `refs/ke_live_home.html` and `refs/localized/ke_live_home.html` were recovered from:
- **Source:** `/Users/ofir/kenyonexpress-web/ke-rc5/refs/`
- **Method:** Copied from prior worktree where files still existed
- **Size:** 791K (original), 786K (localized version)
- **Status:** Valid for gate measurement

## Next Steps

1. ✅ Mobile fix goal is now at head of queue
2. Mobile UI must be adjusted to bring score below 11%
3. Re-measure after fixes to verify improvement
