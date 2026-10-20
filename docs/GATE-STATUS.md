# Mobile Gate Status

**Last Check:** 2026-10-20 13:57 UTC (MAINTENANCE_LOOP_6)  
**Page:** home  
**Commit:** `f90f38679` (clean tree at the 1440 run; the 380 and 768 rows carry `-dirty` only because the 1440 row had already been appended to the parity ledger)  
**Server:** `pnpm start` on port 3341 from this worktree, listener pid and cwd verified before the run  
**Threshold:** 11%

| Viewport | Score | Status | Best known (compare.mjs) | Lowest ledger row |
|---|---|---|---|---|
| 380 (mobile) | **47.23%** | FAIL (36.23 over) | 30.26% | 10.68% (08.09) |
| 768 | **42.02%** | FAIL (31.02 over) | 29% | n/a |
| 1440 | **31.28%** | FAIL (20.28 over) | 8.29% | 8.29% |

The 380 run was repeated once on the same server. Both runs returned 47.23% with identical band profiles, so the number is deterministic and not slider phase.

## Comparison Results (380)

- **Live:** 380x17790px (localized archive `refs/localized/ke_live_home.html`)
- **Local:** 380x6199px
- **Compared:** 380x2600px (first segment)
- **Reference shortfall:** 96 failed to load (57 scripts, 37 fonts, 1 stylesheet, 1 xhr). This is the known deterministic baseline for the single-file archive. The 48 missing images reported by every run since 01:21 UTC are gone: `refs/live-assets/` was absent from this worktree and has been copied in from the main checkout (refs/ is gitignored, so this is local state, not a commit).

## Worst Bands (380)

1. y 1800-1900: **77.0%**
2. y 1200-1300: **76.5%**
3. y 2200-2300: **75.0%**
4. y 900-1000: **74.8%**
5. y 600-700: **74.7%**
6. y 1700-1800: **73.7%**

Only y 1400-1500 (3.1%) and y 2000-2100 (2.3%) are near parity.

## Root Causes (measured from the two 380 screenshots, not inferred)

1. **Product grid column count.** The live mobile page renders ONE product card per row, each card about 470px tall with a full-width image. Ours renders TWO cards per row at about 300px. Every band from y 900 downward is a one-column list diffed against a two-column grid, which is why the page is 6199px against 17790px and why 15 of 26 bands exceed 45%.
2. **Hero band.** Live at 380 shows the Revolution Slider as a single tall phone image (about 420px). Ours shows the "ברוכים הבאים לקניון Express" text hero plus two category tiles (ירושלים, תל אביב) in the same vertical space. Bands y 200-700 are this mismatch.
3. **Consent banner inside the compared window.** Our screenshot carries the cookie-consent sheet fixed at the bottom of the 2600px viewport (y 2350-2600). compare.mjs does not preset the `ke_consent` cookie, so the banner is diffed against live product cards. Bands y 2200-2500 include it.
4. **Reference header.** The archive's 37 missing fonts render the Electro icon glyphs as Latin letters in the live top bar (y 0-200). That part of the 58.6% at y 0 is reference failure, not ours.

The earlier reports in this file (19.04% at 1440, 20.46% at 380) were measured with 48 reference images missing. With the images present the diff is higher, not lower, because the reference now paints photos where our layout has different content.

## Action Taken

Gate FAILING at 47.23% on 380 (threshold 11%).  
`MOBILE_FIX_GATE` requeued at the head of `~/ke-goals/queue.txt` with the three measured causes above as its work list, per MAINTENANCE_LOOP_6.
