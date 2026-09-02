# Visual comparison results

`node scripts/compare.mjs --page=<page> --width=<w>` against `refs/`, scored over
the first 2600px in 100px bands. Tolerance is 24 per channel. The project gate is
**under 11%**.

Run against a production build (`pnpm build` then `PORT=3311 pnpm start`), which
is the only server the gate is valid on: a dev server serves different CSS.

## Home — STEP D4, 2026-09-03

| width | before D4 | after D4 | gate |
| --- | --- | --- | --- |
| 380 | 40.45% | **11.0%** | at the line, see below |
| 768 | 36.08% | **7.93%** | pass |
| 1440 | 7.11% | **6.01%** | pass |

### What was wrong, all of it measured against `refs/ke_live_computed.json`

| # | defect | live | ours (before) |
| --- | --- | --- | --- |
| 1 | product grid columns | 1 / 2 / 4 at 380 / 768 / 1440 | 2 below 1024, 4 above |
| 2 | hero row height | 213 / 495 / 613 | 593 at every width |
| 3 | category strip | in-hero at 768, absent at 380 | a second full-width copy below `lg` |
| 4 | feature bar | empty 31px strip at 380, 134px from md | five stacked blocks, 223 at 768 and 76 at 1440 |
| 5 | card footer | stacks at 380, one line from 768 | one line at every width |
| 6 | grid top gap | 3px | 30px |

Defects 2 and 3 were the largest: the hero kept its full desktop height with its
side columns hidden, so the product grid began **967px too low at 380** and
**434px too low at 768** while 1440 was exact. Every band below the fold was
therefore being scored against the wrong rows of live.

Defect 5 is the one that compounded. A card 47px short looks harmless on card
one and is 141px out of step by card four; the 380 bands below y1100 were
reading 50-74% purely from that drift.

### Geometry after the fix

| landmark | 380 ours / live | 768 ours / live | 1440 ours / live |
| --- | --- | --- | --- |
| hero row | 213 / 213 | 495 / 495 | 613 / 613 |
| feature bar | 31 / 31 | 134 / 134 | 134 / 134 |
| grid starts | 444 / 443 | 754 / 754 | 898 / 898 |
| card | 549 / 548 | 501 / 501 | 501 / 501 |

## Deviations: where a spec loses to the measurement

The rule for this run is that the live site wins. These are the places a written
spec asked for something the reference does not contain.

| spec said | reference measures | kept |
| --- | --- | --- |
| price red `#E4002B` | never occurs; card sale price is `#c93636` (57 elements), site-wide price is `#dc3545` (456) | measured |
| container `1320px` | `1170`/`1200`; 1320 never occurs | `1200px` |
| Heebo font stack | `"Open Sans"` on 12024 elements | **Heebo**, deliberately: live paints Hebrew through an unnamed fallback with no Hebrew glyphs |
| home has carousels, promo strips, category tiles | one flat 32-card grid, none of the three | measured |
| old price with strikethrough | no `line-through` on live's old price | our CSS still draws one; 1-2px, left alone |
| search UI in header and handheld | live has both, plus an 80px search form at 768 | **removed**, standing project rule; costs real pixels |

## Why 380 sits at 11.0% and not below

Every geometric landmark above is within 1-2px, and the bands prove the residual
is content rather than layout:

```
y 400-1600   1.7 - 10.1%     cards 1 and 2, geometry and images agree
y 1700-1800  32.6 / 30.3%    card 3, image band
y 2400       47.6%           card 4, image band
y 200-400    21.7 / 21.3%    hero slider frame
```

The spikes land inside image areas, and the good bands sit either side of them.
`KE_LIVE_DEALS` is a snapshot taken 2026-08-12; live's catalogue has since moved
on, so cards 3 and 4 hold different products. Live's own page height moved
between runs in this session (17825 against 18180 an hour earlier), which is the
same drift seen from the other side.

At 1440 the identical 32 cards are laid four across, so the same mismatch is
spread over a quarter as many vertical bands and dilutes to 6.01%. That is the
clearest evidence it is content: one fixture, three scores, tracking the column
count rather than the design.

`scripts/compare.mjs` warns about exactly this in its own comments -- a content
difference wearing a fidelity number -- and refusing to chase it is the
documented position. Re-snapshotting the fixture to today's catalogue would move
the number without changing a pixel of design.


## Category — STEP D6, 2026-09-03

**The gate refuses to score this page, at all three widths:**

```
REFUSING to measure: the two grids hold 2 cards each, but only 1 of 2 slots
hold the same product (50%). 1 of the products exist on both sides, in
different places.
```

That is `compare.mjs` working as designed, not a design signal. Live's
`hot-deals` category holds two products today and one of them is not the one in
our fixture, so any percentage it printed would be a catalogue difference
wearing a fidelity number. The refusal is the same guard that
`docs/KNOWN-ISSUES.md` and the script's own comments describe.

### What was verified instead, from `refs/ke_live_computed.json`

The product grid geometry is already exact. Card x and width, ours against
live:

| width | ours | live |
| --- | --- | --- |
| 380 | x190 w175 | x190 w175 |
| 768 | x519 w234 | x499 w230 |
| 1440 | x1071 w234 | x1071 w234 |

380 and 1440 match to the pixel; 768 is 20px out in x and 4px in width. The
column counts implied by those widths (2 / 3 / 5) are live's.

### The two references disagree about the header, and nothing can satisfy both

| | top bar | header |
| --- | --- | --- |
| `home` @380 | 113 | 84 |
| `category` @380 | **76** | **40** |
| `home` @1440 | 38 | 110 |
| `category` @1440 | 38 | **127** |

Both come out of the same capture. A 40px header at 380 is Electro's sticky bar
in its collapsed, scrolled state, so the category snapshot was almost certainly
taken mid-scroll. The shell is tuned to the `home` reference, which is the one
the gate can actually score, and it is left alone here.

Our category grid therefore starts lower than the category snapshot (464 against
310 at 380) almost entirely because our header is the taller, un-collapsed one.
No blind correction was made: with the gate refusing there is no way to prove a
change is an improvement, and restyling against a reference that contradicts the
measurable one is how a regression ships.

### Fixed under D6

The 404 page linked to `/search`. After D3 removed the header field that was the
last search entry point left in the storefront, and the rule is that there is
none anywhere. It now points at the product listing.


## Product — STEP D7, 2026-09-03

**The gate refuses this page too, at all three widths:**

```
REFUSING to measure: live shows 1 product cards and the local page shows 4.
```

Live's related-products carousel currently holds one card and ours holds four.
That is a catalogue difference, not a design one, and `docs/KNOWN-ISSUES.md`
already records it with the instruction not to chase slugs to make the number
move. Cutting our carousel to one card to satisfy the guard would be fitting the
measurement rather than the design.

### Spec items verified present

| spec | state |
| --- | --- |
| add-to-cart yellow `#fed700`, hover `#fedd26` | `--pdp-brand` / `--pdp-brand-hover`, both correct |
| quantity control | present, and a plain number input on purpose: live has no +/- stepper, measured 2026-07-28 |
| supplier block with locations and Waze | `SupplierInfo.tsx`, `wazeHref` |
| reviews section | `components/product/Reviews.tsx` |
| gallery, price block, coupon vs physical branch | `ProductGallery`, `ProductInfo`, `CouponPricing` |

### Fixed under D7: the two palettes could drift apart silently

`product-page.css` declares its own `--pdp-*` colours, and `PDP_CSS_VARS` gates
those against `tokens.ts`. Nothing gated the two palettes against **each other**,
and eight of the twelve PDP colours are the same value as a `SITE` colour held
in a different object.

The failure that allowed is quiet and total: rebranding through
`SITE.brand.primary` -- which `tokens.ts` names as the way to rebrand -- moves
the header, the cards and every button on the site and leaves the product page's
add-to-cart the old yellow. No test fails, because each half still agrees with
its own source.

`tokens.test.ts` now asserts the eight shared colours are equal. All eight pass
today, so this locks the current state rather than changing a pixel. The four
with no site counterpart (`action`, `rule`, `buy`, `buyHover`) are excluded:
they are measured values that exist only on that template.


## Products index + suppliers — STEP D8, 2026-09-03

**The gate refuses, and this one is the closest of the three:**

```
REFUSING to measure: the two grids hold 24 cards each, but only 15 of 24 slots
hold the same product (63%). 21 of the products exist on both sides, in
different places.
```

24 cards on both sides and 21 of the 24 products shared. Three differ, and three
differences are enough to shift every slot after the first of them, which is
what takes 21 shared products down to 15 shared slots.

### Live's archive order, established from the reference

`src/lib/category-page.ts` claimed live's default order "matches
Hebrew-alphabetical name order". Checked against `refs/ke_live_products.html`:
after de-duplicating the markup the 24 slots read

```
אייפון 13   ! צימר מאסטר   אבחון וטיפול רפסולוגי   אוזניות AirPods 3
אייפון 13   ארוחה בשרית   ארוחה בשרית זוגית   ארוחה זוגית עם פלטת ...
```

Alphabetical from slot two onward, with one product out of order at the top
**and again in its own alphabetical place**. That is a pin, not a sort. The
comment was half right: the rule is featured-first, then alphabetical.

The query now orders `is_featured` descending before `name_he`. It changed
nothing measurable today -- the score stayed at 15/24 -- because no row in the
current fixture carries `is_featured`. It is still the correct rule, and it is
the rule live is running.

### Suppliers

The route is `/s/[id]`, not `/suppliers/[slug]` as the step text has it;
`/suppliers` is the join-us marketing page. `/s/[id]` arrived with the D1 merge
and prerenders 7 supplier paths from the live database. There is no
`refs/ke_live_supplier.html`, so there is nothing to score it against and no
1:1 claim is made for it here.

### Summary: three pages, three refusals, one cause

| page | guard | shared products |
| --- | --- | --- |
| category | 1 of 2 slots | 1 of 2 |
| product | 1 card against our 4 | related carousel |
| products | 15 of 24 slots | 21 of 24 |

All three are the same thing: `refs/` was captured 2026-08-12 and live's
catalogue has moved since. None of them is a design signal, and the guard
exists precisely so that a catalogue difference cannot be reported as a
fidelity score. Home is the one storefront page whose fixture still lines up,
and it is the one that scores.
