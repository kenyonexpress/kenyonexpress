# Mobile Gate Status

**Last Check:** 2026-10-20 15:36 UTC (DESKTOP_TABLET_FIX_GATE)  
**Page:** home  
**Commit:** working tree of `3494b7478` plus the DESKTOP_TABLET_FIX_GATE changes (rows carry `-dirty`; the commit that lands them is named in STATE.md)  
**Server:** `pnpm start` on port 3341 from this worktree, fresh `pnpm build` (BUILD_ID pjXJXNi0IUuTBKIT-Rio0, listener verified by pid and cwd)  
**Threshold:** 11%

| Viewport | Score | Status | Previous (14:39-14:43) | Best known (compare.mjs) | Lowest ledger row |
|---|---|---|---|---|---|
| 380 (mobile) | **8.50%** | **PASS** | 8.76% | 30.26% | 8.50% (this run) |
| 768 | **9.80%** | **PASS** | 41.82% | 29% | 7.72% (07.09) |
| 1440 | **8.10%** | **PASS** | 30.05% | 8.29% | 8.10% (this run) |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md, in the order the goal prescribes (768, 1440, 380), all on the same build:

```
| 2026-10-20 15:31 | home | 768 | 9.80% | PASS | `3494b7478-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-20 15:34 | home | 1440 | 8.10% | PASS | `3494b7478-dirty` | ref 180 failed to load (103 script, 74 font, 2 stylesheet, 1 xhr) |
| 2026-10-20 15:36 | home | 380 | 8.50% | PASS | `3494b7478-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## What moved 768 from 41.82% to 9.80% and 1440 from 30.05% to 8.10%

Every cause was probed with a getBoundingClientRect dump on both sides (refs/_probe-range.mjs, refs/_probe-deep.mjs, refs/_probe-sel.mjs, refs/_probe-img.mjs; untracked, refs/ is gitignored) before any CSS changed. Measured builds in order: 12.15% (768) after steps 1-5, 12.11% after 6-7, 9.80% after 8-9; 1440 8.23% after 1-7 and 8.10% after 8-9; 380 8.50% throughout.

| Step | Measured cause | Change |
|---|---|---|
| 1 | The "vertical category list over the right half of the hero" was the CLOSED MobileDrawer. `end-0` under dir="rtl" is the LEFT edge (computed `left: 0`), and `translate-x-full` then pushed the panel RIGHT into the page: x350 w350 at 768, x280 w280 at 380 (100px on screen). Live's closed panel is at x769. | `start-0` |
| 2 | Header 84px at 768 off the `h-header-handheld` token; live's header#masthead is y38 h49 at 768 (hero at y88). Ours opened at y122 and the whole page sat 35px low. | `h-header-phone` through xl; token left in place, marked unused |
| 3 | Grid item padding 72px at every width from 768 up. Live's `.jet-listing-grid__item` is 501 around a 485 card at 768 AND 1440: 8px, same as 380. Ours was 629; p_con at y826/y970 against live's y727/y906, every later row 128px low. | `padding: 8px 0` in the base rule |
| 4 | CitiesRow `w-1/2` below lg: two 384px cells where live's li.category is 146px at 768 exactly as at 1440. | `md:w-[20%]` |
| 5 | BenefitBar `sm:w-1/2` wrapped into three rows of two and spilled 75px under the 134px band. Live at 768: `.features-list` x39 w690, five 180px `.feature` right-to-left, the fifth clipped at x-172. | one clipped row, 180px cells at md, fifths at lg, 690px list at md |
| 6 | Hero column x0 w768 at 768; live's slider is x40 w728 (40px white on the left, inline-end in RTL). `pe-10` resolved to 35px off this root font size, so it is a token. | `md:pe-hero-inset-tablet` (40px) |
| 7 | WhatsApp circle bottom-LEFT (`end-5`) where live's is bottom-right at all three widths; both the missing circle and the extra one count. 380 y2500 band 18.8% -> 15.1%. | `start-5`; the spec says only "bottom corner" |
| 8 | Card 3 (ke-deal-8893): live's browser picks the 600x600 WordPress crop at 768 (245x245 at x115) and the portrait original at 380 and 1440. Ours rendered the portrait (196x245) everywhere; the two bands it spans read 26%. A hard crop is the centre of the image, so `cover` from the centre on a 245px square paints the same pixels from the same file. | `KE_LIVE_DEAL_TABLET_SQUARE` -> `data-thumb-md="square"` -> 768-1023 rule |
| 9 | Feature items 4px high at 768 AND 1440: live's list starts 30px into the band (not centred) and is 81.4 tall with the 68px items centred in it (y619 / y798); ours were at y615 / y794. | `md:pt-usp-offset`, `min-h-usp-list`, items-center |

Also in this change: the slider tint is white below lg too (live's rs-module/rs-slide/rs-sbg are transparent on a white column at 768 and 1440). Measured pixel-neutral: #eef4f7 against white is 17/11/8 per channel, under diff-bands' 24 tolerance.

Checked and ruled out: serving the card photographs at the original resolution (in-page swap, refs/_probe-imgtest.mjs). Rows 1 and 3 already match live at 0.6% and 1.9%; originals move the page from 12.2% to 11.6% at the cost of 735px downloads for 286px slots. Not done.

## Remaining 768 bands above 15%

1. **y100-300 (31%, 33%): the hero.** Live's copy renders in the archive's serif fallback (its web fonts are in the 96 failed requests) at 51px lines, beside the same phone photograph the 380 note describes. Font and photograph are both floors on our side.
2. **y400 (49%), y500 (17%): the category strip and the slider's bottom edge.** Live paints four product photographs and one text cell in the strip; ours paints the city illustrations in grey rounded boxes. Content, not geometry: the cells are 146px on both sides.
3. **y2400-2500 (17.5%, 34%): row four.** Live's eighth card has a broken image in the archive at 768 (naturalWidth 0, the compare.mjs "3 such images" note); ours shows the facial photograph. The WhatsApp circles now coincide.

## Remaining 1440 bands above 15%

- **y200-300 (24%, 19%) and y500-600 (25%, 17%): the hero's side columns.** Promo column placeholder art against live's three product-shot banners, and the strip's city art against live's product photographs (asset gate). Geometry matches to the pixel (sidebar x1064 w241, slider x336 w728, strip cells 146).
- **y0-100 (11.3%): the masthead.** The row of twelve category links sits where live has a 534px search field, a locations dropdown and five header icons. Standing rule: no search UI. This is the recorded pixel cost: 11.3% of the first band and 8.8% of the second, about 0.8 points of the 8.10%.
- **y1600-1700 (16%, 19%): row two's photographs**, the same codec-noise residual the 768 row-two right card shows (live serves a JPEG, ours an AVIF of the same file).

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

## 768 and 1440: the 14:41 / 14:43 causes, now closed

The four causes read off the failing screenshots (drawer over the hero, two 384px city cells, wrapped feature bar, 72px item padding at 768; placeholder art, the menu row and a 90px-low grid at 1440) are the rows of the table above. The grid was low at both widths for one reason, the 72px padding, plus the 35px header at 768.

## Measurement notes

- compare.mjs now presets `ke_consent=denied.<CONSENT_WORDING_VERSION>` on the LOCAL capture only, reading the version from src/lib/analytics/consent.ts. The reference is a WordPress archive without the banner and the cookie is scoped to the local host. Locked by three tests in scripts/compare-reference.test.mjs.
- Reference shortfall stays 96 (57 scripts, 37 fonts, 1 stylesheet, 1 xhr): the known deterministic baseline of the single-file archive with refs/live-assets present.
- Live's 380 body height moved from 17790 to 18146 between runs with no change on our side; this is Revolution Slider phase in the archive and does not reach the first 2600px.
