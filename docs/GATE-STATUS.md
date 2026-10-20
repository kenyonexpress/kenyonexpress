# Mobile Gate Status

**Last Check:** 2026-10-20 14:43 UTC (MOBILE_FIX_GATE)  
**Page:** home  
**Commit:** working tree of `b400414b3` plus the MOBILE_FIX_GATE changes (rows carry `-dirty`; the commit that lands them is named in STATE.md)  
**Server:** `pnpm start` on port 3341 from this worktree, fresh `pnpm build` (BUILD_ID of the measured build in STATE.md)  
**Threshold:** 11%

| Viewport | Score | Status | Previous (13:57) | Best known (compare.mjs) | Lowest ledger row |
|---|---|---|---|---|---|
| 380 (mobile) | **8.76%** | **PASS** | 47.23% | 30.26% | 8.76% (this run) |
| 768 | **41.82%** | FAIL (30.82 over) | 42.02% | 29% | 7.72% (07.09) |
| 1440 | **30.05%** | FAIL (19.05 over) | 31.28% | 8.29% | 8.29% (15.10) |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md:

```
| 2026-10-20 14:39 | home | 380 | 8.76% | PASS | `b400414b3-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 14:41 | home | 768 | 41.82% | **FAIL** | `b400414b3-dirty` | WORSE than the 29% best known for home/768 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 14:43 | home | 1440 | 30.05% | **FAIL** | `b400414b3-dirty` | WORSE than the 8.29% best known for home/1440 (tolerance 0.5); ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## What moved 380 from 47.23% to 8.76%, in the order it was measured

Each step was built, served on 3341 and measured before the next one.

| Step | Change | 380 after |
|---|---|---|
| 0 | baseline, f90f38679 | 47.23% |
| 1 | rc5 F03 phone block removed from product-card-deals.css (two-column grid, compact cards, clamp hero slot, yellow 56px masthead); TopBar back at every width; hero chips `hidden md:block`; hero section `h-hero-mobile`; compare.mjs presets `ke_consent` on the local capture | 44.55% |
| 2 | header row 48px below md (live 49 incl. border, was 84); item padding 8px top/bottom below 768 (live 8, was 72); hero slider on white below 768 (live rgb 255) | 11.40% |
| 3 | phone logo at x205 (`max-md:me-auto`); grid opens at y408 (`.home-deals` 2px top, was 3); price row 27.4px start-aligned, footer gap 20, cart circle at inline-start; mega menu item padding px-2 (was overflowing the 1440 page to 1490px) | 8.76% |

Step 3 shows 9.33% in the ledger at 14:30 for the version where the footer rules were placed BEFORE the base block and lost on source order (same specificity); 8.76% is the same change placed after it.

## Remaining 380 bands above 15%

1. **y 200-400 (56.1%, 34.5%): the hero.** Live paints one phone photograph about 200x170 centred on white (x60-260, y185-355). Every pixel of that photograph differs from anything we can paint there (the template imagery is quarantined by the asset gate), so these two bands have a floor of about 53% and 35% whatever our hero shows. Our text hero adds about 3 points over that floor. Not actionable on our side.
2. **y 1700-1800 (20.1%): card three's pool photograph.** Live's item pitch is 548.4px fractional; ours is 548.4 now too, but live's grid opens at y408.4 and rounds differently from our y408, so the third photograph sits one pixel off. A high-detail photograph one pixel off reads as 20%. Card one and two (lower-contrast photographs) read 1-9% at the same offset.
3. **y 2500-2600 (18.8%): the fixed bottom tab bar** (MobileNavBar, 56px) pinned to the bottom of the 2600px capture viewport, plus our WhatsApp circle sitting bottom-LEFT where live's sits bottom-RIGHT. Real UI, not a measurement artefact; left alone.
4. **y 100-200 (15.4%): the handheld header icons.** Live has five 22px icons (search, compare, wishlist, account, cart) overflowing to x-15; ours has two. The logo now overlaps live's exactly (x206 vs x205).

## 768 and 1440: measured causes, NOT fixed here

Both regressed before this goal and from different commits than the 380 failure (last PASS: 768 on 07.09 at 7.72%, 1440 on 16.10 08:48 at 9.73%). Read off the 14:41 and 14:43 screenshots against the live archive:

**768 (ours 768x11207, live 768x9152):**
- A vertical category list paints over the right half of the hero (y80-430): the mega menu's below-xl variant or the category sidebar is rendering at 768 where live has none.
- CitiesRow renders two 384px cells (`w-1/2` below lg); live's strip is five 20% cells of product imagery (y426 h170).
- BenefitBar wraps to two rows of two at 768; live is one row of four.
- Grid item padding is still the 72px desktop value from 768 up; live's 768 pitch is 501 for a 501 card, i.e. no item padding. Our grid starts about 70px lower and every row is about 140px taller.

**1440 (ours 1440x6488, live 1440x5492):**
- Promo column: three tiles with yellow pills and placeholder art against live's three product-shot banners.
- Category strip under the slider: our city illustrations against live's four product photographs.
- The mega menu row of twelve category links sits in the masthead where live has a 534px search field (standing rule: no search UI; the pixel cost was already recorded). The row overflowed the page to 1490px until this goal's px-2; the page is 1440 wide again.
- Grid starts about 90px lower than live, so bands from y1000 down are one card-row out of phase (55% at y1100-1300).

These are the work list of the follow-up goal queued at the head of ~/ke-goals/queue.txt (DESKTOP_TABLET_FIX_GATE).

## Measurement notes

- compare.mjs now presets `ke_consent=denied.<CONSENT_WORDING_VERSION>` on the LOCAL capture only, reading the version from src/lib/analytics/consent.ts. The reference is a WordPress archive without the banner and the cookie is scoped to the local host. Locked by three tests in scripts/compare-reference.test.mjs.
- Reference shortfall stays 96 (57 scripts, 37 fonts, 1 stylesheet, 1 xhr): the known deterministic baseline of the single-file archive with refs/live-assets present.
- Live's 380 body height moved from 17790 to 18146 between runs with no change on our side; this is Revolution Slider phase in the archive and does not reach the first 2600px.
