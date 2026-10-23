# C08: Mobile Gate /account + /wallet + /vouchers - FINAL ASSESSMENT

**Date:** 2026-10-23  
**Branch:** autopilot  
**Goal:** Verify /account, /account/wallet, and /account/vouchers pages are under 11% parity at mobile widths (380/768/1440)

## Result

**GOAL UNACHIEVABLE - No valid reference baseline exists**

## Why This Goal Cannot Be Met

### The 11% Gate Measures Fidelity to WordPress/Electro

Per docs/REFS-POLICY.md lines 124:
> **The 11% gate in `CLAUDE.md` refers to the first** [10.68% against the real WordPress site, while it was live]

The parity gate measures how closely the Next.js implementation matches the WordPress/Electro reference. For account pages:

1. **No WordPress equivalent exists** - Account functionality is new to Next.js
2. **No reference snapshots captured** - refs/localized/ contains no account page HTML
3. **Self-comparison is explicitly invalid** - Measuring Next.js against itself produces meaningless 0% (already reverted in 592c663a2)

### Why Next.js Baseline Was Invalid

Attempted approach: Capture baseline from current Next.js build, measure against same build 500ms later.

**Result:** 0.00% difference across all measurements.

**Why this is meaningless:**
- Same server render, same pixels, taken 500ms apart
- No reference design being measured against
- This exact approach was tried and reverted in C07 (commit 54f5bf880, reverted in 592c663a2)
- From that revert message: "produces meaningless 0% measurements"

Per docs/REFS-POLICY.md:
> A fidelity score against yourself is worse than no score, because it looks like a score.

### What About C06?

C06 reported "Category (vs Next.js baseline): 380px 1.21%, 768px 0.53%, 0.31%"

Those percentages were NOT measuring against a reference - they were documenting that category pages render consistently. The goal was achievable because:
- Category pages DO have WordPress references (refs/localized/ke_live_category.html)
- The measurements could be run against the actual reference
- The Next.js baseline was for consistency checking, not parity measurement

Account pages have no such reference to measure against.

## What Would Be Needed

To achieve this goal would require:

1. **Historical WordPress snapshots** - Authenticated captures of /my-account/ from WordPress site before DNS cutover (don't exist)
2. **Structural equivalence** - WordPress /my-account/ tabs mapping to Next.js routes (not equivalent)
3. **Valid baseline** - Something other than "ourselves from 500ms ago"

None of these exist or can be created.

## Routes Verified (But Unmeasurable)

Routes exist and render correctly:
- `/account` - Account dashboard (src/app/(account)/account/page.tsx) ✓
- `/account/wallet` - Wallet balance and transactions ✓
- `/account/vouchers` - User's purchased vouchers ✓

Build verification:
- pnpm typecheck ✓ exit 0
- pnpm lint ✓ exit 0
- pnpm build ✓ exit 0

## Recommendation

**Skip C08** - This goal asks for a measurement that cannot be produced with valid methodology.

The 11% parity gate is designed to measure fidelity to the WordPress/Electro reference. Account pages are new functionality with no reference to measure against.
