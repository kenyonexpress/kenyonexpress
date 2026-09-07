# UI parity log (`compare.mjs`)

History of pixel scores per route per breakpoint. Gate: **under 11 percent** at 380, 768 and 1440, against a **production build**, never `next dev`.

This worktree (`ke-arch`, branch `docs/ui-design-system`) does **not** run the gate. There is no local `node_modules` here. Installing would write into the main checkout. Numbers below are copied from dated markdown in this tree. They are not re-measured in this pass.

Command (run from the main project root, not from here):

```
PORT=3311 pnpm start
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

Width override: `--width=380` (or 768 / 1440). Default viewport height 2600. Tolerance 24 per channel. Bands of 100px.

Status: log. Docs only.

Companions: `docs/DESIGN-SYSTEM.md` §6, `docs/design/COMPARE-RESULTS.md`, `docs/VISUAL-PARITY.md`, `docs/PIXEL-WAVE-REPORT.md`, `docs/LAUNCH-READINESS.md`.

---

## 0. How to read a cell

| Mark | Meaning |
|---|---|
| percent | Banded pixel difference. Lower is closer |
| pass | under 11 percent |
| over | scored, at or above 11 percent |
| refuse | script exited without a fidelity number (catalogue / grid mismatch). This is **not** a fail |
| n/a | no `refs/` twin, or route requires auth / is not a storefront template |
| volatile | geometry is exact; catalogue images move the number between runs |

A refuse is `compare.mjs` working. Do not cut related-product cards to one, and do not restore header search, to chase a number.

Known tool bugs that poisoned early numbers (fixed in the script, keep in mind when reading 2026-08-19 rows):

1. Parallel runs shared `refs/live.png` / `refs/mine.png` and compared the wrong pages (a cart run reported home height 5492).
2. No scroll, so lazy images were half-decoded. Scores jumped between identical builds.

After the fix, screenshots go to `refs/.run-<pid>-<side>.png`.

---

## 1. Routes the script knows

| `--page` | Local URL | Live twin | Auth |
|---|---|---|---|
| `home` | `/` | `kenyonexpress.co.il/` | no |
| `category` | `/category/{slug}` (fallback if `hot-deals` missing) | live category | no |
| `product` | `/product/{slug}` | live PDP | no |
| `products` | `/products` | live archive | no |
| `cart` | `/cart` | live cart | no (seeded) |
| `checkout` | `/checkout` | live checkout | no (seeded) |
| `search` | `/search?q=` | live search | no |
| `account` | `/account` | live my-account | `COMPARE_STORAGE_STATE` |

No `--page` for: `/account/wallet`, `/account/coupons`, `/account/wishlist`, `/coupon/{id}`, `/s/{id}`, `/city/{slug}`, `/gift/{token}`, `/redeem/{token}`, `/offline`, legal, supplier portal, admin. Those have no WooCommerce 1:1 twin worth scoring. Layout still uses Electro structure + Heebo RTL; content comes from live copy docs.

### 1.1 `/s/[id]` (logged, not scored)

| Date | 380 | 768 | 1440 |
|---|---|---|---|
| 2026-09-03 D8 | n/a | n/a | n/a | no `refs/ke_live_supplier.html` |
| 2026-09-07 this log | n/a | n/a | n/a | Manual: 2 / 3 / 4 columns (not category 5-up). Inactive = 404 |

Do not invent a percent by screenshotting `/suppliers` (join-us) against a store page.

### 1.2 `/city/[slug]` (logged, not scored)

Seventeen `REGIONS` only. Empty region is a real page (not a refuse). No `refs/` twin. Do not screenshot `/products?city=` as if it were this landing (that query is noindex).

---

## 2. Home `/`

Electro home-v7 structure. Content from live. Heebo vs live Open Sans is a standing exception.

### 2.1 Scores

| Date | Source | 380 | 768 | 1440 | Notes |
|---|---|---|---|---|---|
| 2026-08-19 | PIXEL-WAVE (build `jKlu_…`) | (desktop-era table; home **9.83%** at default 1440) | | **9.83% pass** | Three consecutive runs stable after tool fix |
| 2026-09-02 | VISUAL-PARITY STEP 46, :3412 vs live | **42.02% over** | **34.21% over** | **8.07% pass** | Mobile called structural (KNOWN-ISSUES #3), not a token miss |
| 2026-09-03 | COMPARE-RESULTS D4 vs `refs/` | **11.0% at the line** then **28.29%** on a later live height | **7.93% pass** | **6.01% pass** | Landmarks 213/495/613 hero, 31/134 feature bar. 380 is content-volatile (11 to 28) because cards 3–4 are different products |
| 2026-09-01 STATE | gate vs ceiling | 380/768 frozen then unfrozen | | | Height-ratio 0.59 on mobile was a slider-freeze bug, later fixed |

Honest statement for 380: geometry vs `refs/ke_live_computed.json` is within 1–2px at every landmark. The remaining percent lives in image bands (catalogue drift). Re-snapshotting the fixture moves the number without moving design.

### 2.2 Landmarks that must not regress (D4)

| Landmark | 380 | 768 | 1440 |
|---|---|---|---|
| Hero row | 213 | 495 | 613 |
| Feature bar | 31 (empty strip) | 134 | 134 |
| Grid starts | 444 | 754 | 898 |
| Columns | 1 | 2 | 4 |

Defects that used to dominate the score: desktop hero height on a phone, a second category strip below `lg`, five stacked USP blocks, card footer always one-line, 30px grid gap vs 3px.

#### 2.2.1 Landmarks re-verified against the committed capture (pass 13)

The numbers above were carried from dated markdown. They are now checkable:
`refs/ke_live_computed.json` is committed, so the **live** side of each landmark
can be read directly rather than trusted. Measured on `home@{380,768,1440}`.

| Landmark | Element measured | 380 | 768 | 1440 | Verdict |
|---|---|---|---|---|---|
| Hero row | `div.elementor-section.elementor-top-section` | 350 x **213** | 690 x **495** | 1170 x **613** | **confirmed exactly** |
| Feature bar | `div.elementor-section` (the outer one) | **31.00** | **134.39** | **134.39** | **confirmed exactly** |
| First grid item | `div.jet-listing-grid__item` | y**408.66** | y**719.36** | y**897.67** | 1440 confirmed; see note |
| Cards in first row | same | 2 | 3 | 5 | **confirmed** (1/2/4 in §2.2 is the *our-side* column count, not live's) |

Two things this settles and one it does not.

**Settled: the feature bar's 134 is the OUTER section, not the inner list.** The
same band holds five nested boxes and only one of them is 134:

```
.elementor-section        134.39      <- the token, and the landmark
.elementor-container      104.39
.elementor-column         104.39
.elementor-widget-wrap    104.39
.elementor-widget-container 81.39
.features-list             81.39
.feature (item)            79.39      w234
```

A measurement that grabs `.features-list` reports **81** and looks like a
regression against a token that is correct. This is written down because it
already caught one reader in this pass: the first query here returned 104 and
81 and read as a contradiction of `--spacing-feature-bar`, which is right.

**Settled: the bar-to-grid gap is 2.00px at all three widths, not 3.**
`--spacing-deals-top` is `3px` and its comment reasons from "bar ends 895, grid
starts 898". The precise values are **895.67** and **897.67**, so the true gap is
**2.00px**, identical at 380, 768 and 1440. The token rounds two sub-pixel
values in opposite directions and lands one pixel high. One pixel on one edge is
inside the noise of an 11 percent gate, so this is a note rather than a defect;
it is recorded so the next person to remeasure does not "find" it again.

**Not settled: the 444 / 754 grid-start numbers at 380 and 768.** The element
measured here starts at 408.66 and 719.36. Those may be different elements (the
grid *item* wrapper versus the first painted card, which can be inset by its own
padding) rather than a disagreement. The 1440 value matches to within a third of
a pixel, which suggests the method agrees there and the two smaller widths are
measuring different boxes. Resolve by naming the element before quoting the
number, the way the table above does.

**Rule going forward: a landmark without a named element is not a landmark.**
Every row in the table above says which box it measured. Three of the four
"disagreements" found in this pass were selector mismatches, not regressions.

Standing pixel cost: **no search field**. Live has one (534×41 at 1440, yellow `#fed700` top border). We do not.

---

## 3. Category `/category/[slug]`

| Date | 380 | 768 | 1440 |
|---|---|---|---|
| 2026-08-19 PIXEL-WAVE | refuse / forced **17.26%** | | | Guard: 2 products vs 13 |
| 2026-09-03 D6 | **refuse** all three widths | refuse | refuse | 2 cards each side, 1 of 2 slots same product (50%) |

Card geometry (ours / live), verified without a score:

| Width | ours | live |
|---|---|---|
| 380 | x190 w175 | x190 w175 |
| 768 | x519 w234 | x499 w230 (20px x, 4px w) |
| 1440 | x1071 w234 | x1071 w234 |

Columns implied: **2 / 3 / 5**. Header in the category snapshot is a collapsed sticky (40px at 380) vs home’s 84px masthead. Shell stays tuned to **home**. Do not collapse the header to match a mid-scroll category PNG.

#### 3.1 The live column verified, and one word in it qualified (pass 15)

Read off `refs/ke_live_computed.json`, `div.product-outer` in
`/product-category/hot-deals/`:

| Width | Doc's live column | Capture | Verdict |
|---|---|---|---|
| 380 | x190 w175 | **x190 w175** h369.7 | exact |
| 768 | x499 w230 | **x499 w230** h424.7 | exact |
| 1440 | x1071 w234 | **x1071 w234** h437.5 | exact |

All three match to the pixel, so the 768 delta the table records (ours x519 w234
against live x499 w230, a 20px x and 4px w gap) is a real and current parity
defect, not a stale note.

**"Columns implied" is doing real work in that sentence and should stay.** The
capture shows **2 cards in the first row at every width**, including 1440, because
the live `hot-deals` category holds only two products. Five columns are inferred
from card width against container width; they are not observed anywhere in this
capture and cannot be, from a two-product category.

That is the same discipline 2.2.1 ends on. The card **width** is measured. The
column **count** is arithmetic. A future reader checking "5-up at 1440" against
this reference will find two cards and should not read that as a regression.

To observe the count rather than infer it, measure a category with at least five
active products on both sides. That is also what would let `--page=category`
stop refusing.

---

## 4. Product `/product/[slug]`

| Date | 380 | 768 | 1440 |
|---|---|---|---|
| 2026-08-19 | **14.18% over** (related-row) | | |
| 2026-09-02 STEP 46 | n/a (forced 14.92% with `COMPARE_ALLOW_GRID_MISMATCH`) | | |
| 2026-09-03 D7 | **refuse** all widths | refuse | refuse | Live related carousel: **1** card. Ours: **4**. Do not cut to one |

Spec paint verified present (not a percent): ATC `#fed700` / hover token `#fedd26` (shipped hover on purchase is black; both exist), qty as a plain number (live has no +/-), supplier + Waze, gallery, coupon vs physical branch.

Buy-now fill is AA-corrected `#c94b28` (live `#ee6443` fails white text).

---

## 5. Products archive `/products`

| Date | Result |
|---|---|
| 2026-08-19 | refuse; forced **31.92%** (44 vs 61 products) |
| 2026-09-03 D8 | refuse: 24 cards each, 15 of 24 slots same product (63%). 21 of 24 products exist on both sides, in different places |

Sort rule (live): `is_featured` first, then `name_he`. A pin at the top can repeat later in alpha order. H1 on our archive: `חנות` (PAGE-ANATOMY §2.6).

No supplier 1:1: `/s/[id]` has no `refs/ke_live_supplier.html`. `/suppliers` is join-us marketing, not a store.

---

## 6. Cart `/cart`

Scores because both sides can show the **same empty** (or the same seeded line). No catalogue grid.

| Date | 380 | 768 | 1440 |
|---|---|---|---|
| 2026-08-19 PIXEL-WAVE | | | **8.60% pass** (four runs) |
| 2026-09-02 STEP 46 vs live | **19.75% over** | **14.15% over** | **8.6% pass** |
| 2026-09-03 D10 vs `refs/` | 19.61% then **14.81% over** | 13.83% then **10.28% pass** | 8.44% then **8.37% pass** |

D10 move: live ships two footers. Handheld footer is 355px (no newsletter). Ours had stacked the desktop footer (1155px at 380). Accordion `<details>` from `lg` up. Remainder at 380 is the 76+83 vs 113+84 shell offset (category snapshot vs home).

Guard: refuses when the two carts are in different fill states.

---

## 7. Checkout `/checkout`

| Date | 380 | 768 | 1440 |
|---|---|---|---|
| 2026-08-19 PIXEL-WAVE | | | **12.43% over** (4-step wizard vs live one-page). Later two runs **9.72% pass** after CLS fix |
| 2026-09-02 STEP 46 | **14.65% over** | **13.09% over** | **9.58% pass** |
| 2026-09-03 D11 | **11.9% over** (0.9) | **8.16% pass** | **9.38% pass** |
| LAUNCH-READINESS (same week) | 14.64% | 13.11% | **9.72%** |

Electro checkout breakpoints: labels hide below 560; single column below 992. Place-order: `#fed700` / `#333e48`, radius 50, 19.418px / 700. Hover black. Failed route `/checkout/failed` is **n/a** (no twin).

---

## 8. Search `/search`

| Date | Result |
|---|---|
| 2026-08-19 | **refuse** (result counts differ). Forced scores bimodal ~15% / ~10% |

Same query `צימר`: live 4 cards, ours 2. Header search is forbidden, so this page must not grow a masthead field to pick up live pixels.

---

## 9. Account `/account` and siblings

| Route | 380 | 768 | 1440 |
|---|---|---|---|
| `/account` | n/a unless `COMPARE_STORAGE_STATE` | same | same |
| `/account/wallet` | n/a (no twin) | n/a | n/a |
| `/account/coupons` | n/a | n/a | n/a |
| `/account/wishlist` | n/a | n/a | n/a |
| `/account/orders` | n/a | n/a | n/a |

Live YITH wishlist heart in the header is a known miss. We keep it off. Do not log that miss as a gate fail; log it as a standing rule.

Wallet and coupon QR screens have no Electro block. Manual QA: `docs/QA-SCRIPTS.md`.

---

## 10. Brief vs live (why some tokens look "wrong" in a screenshot)

| Brief | Live paints | Gate effect if we adopted the brief |
|---|---|---|
| Price `#E4002B` | `#dc3545` (456), `#c93636` (57 home sale) | every price glyph shifts |
| Container `1320px` | 1200 page / 1170 hero | hero slider +150px, home fail |
| Heebo | Open Sans (no Hebrew glyphs) | kept Heebo on purpose |
| Header search | present | standing rule: omit |

Yellow `#fed700` and hover `#fedd26` and link `#0062bd` **do** appear (yellow as surface, link as product titles).

---

## 11. The reference side, pinned (2026-09-04)

Every score in this log is a diff between two pictures, and this log has only
ever recorded one of them. The **live** side is now measured and committed, so
the other half is checkable.

Source: `refs/ke_live_computed.json`, captured 2026-09-04T04:00:44Z with
`scripts/measure-live-computed.mjs`. 21 captures, 7 templates x 3 widths, the
hero frozen through the slider's own `revapi<N>` API before every shot.

### 11.1 Live body height, by template and width

| Template | @380 | @768 | @1440 | Elements | Pending images |
|---|---|---|---|---|---|
| `home` `/` | **17791** | 9409 | **5492** | 2347 | 0 / 0 / 0 |
| `shop` `/shop/` | 5642 | 4861 | 3730 | 2519 | 0 / 0 / 0 |
| `product` | 2242 | 1924 | 1967 | 717 | 0 / 0 / 0 |
| `category` | 1506 | 1389 | 1396 | 726 | 0 / 0 / 0 |
| `cart` | 1445 | 1244 | 1458 | 443 | 0 / 0 / 0 |
| `checkout` | 3116 | 2949 | 2294 | 725 | 0 / 0 / 0 |
| `account` `/my-account/` | 1325 | 1192 | 1408 | 507 | 0 / 0 / 0 |

Element counts are identical across all three widths for every template, which
is what a responsive CSS layout should look like: the same DOM, laid out
differently. A capture whose element count differs by width fetched a different
page.

### 11.2 Why this table is a capture-validity check

`diff-bands.mjs` crops to `min(live.h, mine.h, 2600)` and warns when
`mine.h / live.h` leaves the 0.62–1.6 band. Both inputs depend on live's height
being **right**, and the failure mode is that it silently is not: a lazy image
that has not loaded has no intrinsic height and collapses the block it sits in,
so the live page is captured short and our footer is scored against live's
mid-page.

Two numbers in this log's history are that failure:

| Recorded | Live height | Correct height | What it actually was |
|---|---|---|---|
| home 34.54 percent | 3730 | **5492** | 1762px of the live homepage missing |
| category 25.58 percent | 3730 | **1396** | same capture, same morning |

**Before trusting any score, check the live height against 11.1.** If
`--page=home --width=1440` reports a live height that is not 5492, the number
is not a fidelity measurement and no amount of band-reading will make it one.

The 3730 coincidence is worth naming so it is not mistaken for a pattern:
3730 is `shop@1440`'s own legitimate height. The broken home captures landing
on the same number is chance, not a shared cause.

### 11.3 The two widths where home is enormous

`home@380` is **17791px**, over three times its 1440 height, and `@768` is
9409. The 2600px crop therefore scores **15 percent of the mobile homepage**
and everything below is unmeasured. A "pass" at 380 on the home route is a
statement about the first 2600px only.

17791 is also the number `compare.mjs` records for a correctly frozen slider.
A home capture at 380 reporting 17825 instead had the hero on a different
slide: that 34px is the carousel, and it was worth the difference between
10.96 and 28.25 percent on three otherwise identical runs.

### 11.4 What this does not give you

These are live's numbers only. Nothing here says what **our** side measures, so
no score in sections 2 through 9 changes. It closes the question "was the
reference sound", not "how close are we".

---

## 12. The refusal reference

Section 0 defines `refuse` as one thing. It is eight, they are checked in a
fixed order, and they carry two different exit codes. An operator staring at a
refusal needs to know which one fired, so this is the full list, read off
`scripts/compare.mjs` and verified line by line.

**A refusal is the script working.** It means the two pages were not comparable
and no honest number exists. It is never a fail, and the fix is never to change
the page to make the refusal go away.

### 12.1 Exit 2: the argument is wrong

| Condition | Message |
|---|---|
| unknown `--page` | `unknown --page=<x> (use home, product, category, products, search, cart or checkout)` |

Note this list does **not** include `account`, even though section 1 documents
`COMPARE_STORAGE_STATE` for it. Check the script before quoting an `--page=account`
run as a gate result.

### 12.2 Exit 3: the two pages are not the same page

In the order the script checks them:

| # | Refusal | Fires on | Escape hatch |
|---|---|---|---|
| 1 | Either side rendered a **not-found** page: title contains `404`, or the body matches `This page could not be found` / `לא נמצא` | any `--page` | **none** |
| 2 | `--page=checkout` and the URL is **no longer `/checkout`**: the seeded cart did not stick, so both sides would be photographs of the cart | `checkout` | **none** |
| 3 | The two **carts are in different fill states** (one empty, one filled) | `cart` | `COMPARE_CART_EMPTY=1` measures the empty state on both sides deliberately |
| 4 | A **rendered image had not loaded** when the shutter fired, on either side | any | `COMPARE_ALLOW_PENDING_IMAGES=1` |
| 5 | The two grids hold a **different number of cards** | `category`, `products`, `search`, `product` | `COMPARE_ALLOW_GRID_MISMATCH=1` |
| 6 | Same count, but **fewer than 80% of slots hold the same product title** | same four | `COMPARE_ALLOW_GRID_MISMATCH=1` |
| 7 | One side **paints a main product image and the other paints none** | `product` | `COMPARE_ALLOW_GRID_MISMATCH=1` |

Refusals 1 and 2 have no escape hatch on purpose: there is no reading of a 404,
or of a cart photographed as a checkout, that is worth a percentage.

Refusal 6 is **positional, not set overlap**, and that distinction is the whole
point of it. A product that exists on both sides but sits two rows lower
contributes exactly as much pixel mismatch as one that does not exist at all.
The rows in section 5 that read "24 cards each, 15 of 24 slots same product
(63%)" are this check: set overlap on that run was far higher and would have
passed a naive threshold, teaching the next reader that the shop page has a
design problem it does not have.

Refusal 7 is the one that is **live's defect, not ours**. Live's gallery holds a
loaded, laid-out image under an inline `opacity: 0` that no rule on the page
clears. Matching that reference means removing our product photo. Do not.

### 12.3 Exit 4: the reference was moving

| # | Refusal | Escape hatch |
|---|---|---|
| 8 | Either side's **hero moved between two samples 600ms apart** | `COMPARE_ALLOW_MOVING_HERO=1` |

Distinct exit code because it is a distinct kind of failure: the page was fine,
the shutter was not. Live is frozen through `window.revapi<N>.revpause()` and
`revshowslide(1)`; if that API is ever renamed, the reference sits on an
arbitrary slide and the score is carousel phase rather than layout.

### 12.4 The three warnings, which are more dangerous than any refusal

A refusal exits. **These print a number and keep going**, so the number reaches
a log, a commit message or this file looking exactly like a real score.

| Warning | Text | What the number means |
|---|---|---|
| Styles never confirmed | `WARNING: styles never confirmed for <url>; treat any diff as unmeasured` | The page may have been shot before its stylesheet parsed. A flash of unstyled content scores enormous. **Discard the run.** |
| Sweep timed out | `WARNING: the scroll/settle sweep for <url> did not finish in 90000ms; continuing to the shutter.` | Lazy images below the fold may never have been requested. Treat as suspect; re-run. |
| Height ratio | `!! HEIGHT RATIO <N>x — the percentage above is NOT a pixel gate.` (fires above 1.6 or below 0.62) | The two captures are structurally different pages. Printed by `diff-bands.mjs`, deliberately as a warning and not an exit, because `--page=search` legitimately differs in length. |

The height-ratio warning exists because a stale `next start` held the port and
served an old build: the same commit scored **45.53%** against that server and
**11.07%** against a current one, and nothing in the output said which to
believe.

**Rule for this log: never append a row from a run that printed any of the
three.** If a row's provenance is unknown, mark it `volatile` rather than
quoting it as a score.

### 12.5 Reading a forced number

Rows above that say "forced" were produced with an escape hatch set. A forced
number is a **measurement of a known-incomparable pair**, useful only for
reading the bands that are not affected (header, footer, shell). It is not a
gate result and must never be compared against 11 percent.

## 13. What this pass did not re-run

No `pnpm`. No `compare.mjs`. No checkout of `closeout/v1-final`. No files under the main repo folder.

If a later agent can run the gate from the main checkout, append a dated row. Do not overwrite history.

## 14. Crop arithmetic: what 2600px actually scores, per route

Section 11 pinned live body heights. Section 13 mapped home bands. This is the
orthogonal cut: `diff-bands.mjs` crops at `min(live.h, mine.h, 2600)`, so a
"pass" is never a statement about the whole page unless the live body is
shorter than 2600.

Heights from the 2026-09-04 capture (section 11.1). Crop = 2600.

| `--page` | live@380 | live@768 | live@1440 | Fraction scored @380 | @768 | @1440 |
|---|---|---|---|---|---|---|
| `home` | 17791 | 9409 | 5492 | **15%** | 28% | 47% |
| `products` (shop twin) | 5642 | 4861 | 3730 | 46% | 54% | 70% |
| `product` | 2242 | 1924 | 1967 | **100%** | 100% | 100% |
| `category` | 1506 | 1389 | 1396 | **100%** | 100% | 100% |
| `cart` | 1445 | 1244 | 1458 | **100%** | 100% | 100% |
| `checkout` | 3116 | 2949 | 2294 | 83% | 88% | **100%** |
| `account` | 1325 | 1192 | 1408 | **100%** | 100% | 100% |

### 14.1 What this changes about the log above

**Home @380 can pass while the footer is unmeasured.** 2600px of 17791 is the
hero, the empty 31px feature strip, and the first three deal cards (section
13.3). The handheld footer accordion that D10 fixed on cart never appears in a
home@380 score. Manual QA still has to open the footer (`docs/QA-SCRIPTS.md` §1
row 9).

**Cart, category and PDP scores are whole-page.** If those routes fail, the
defect is in the picture, not below the crop. Cart's remaining 380 miss (D10
14.81%) cannot be excused as "below the fold".

**Checkout @1440 is whole-page; checkout @380 is not.** 3116 vs 2600 leaves
516px off the bottom at 380, which is where the place-order pill and the
terms tick live if the form is long (physical address + iframe). A 380 pass
that never reached `#place_order` is a pass of the stepper and the identity
step. Manual QA §4 row 7 still has to scroll.

**Shop / products @380 scores the first 2600 of 5642.** That is the control bar
plus roughly the first two card rows of a 2-up grid (card ~370 tall). A refuse
on card-count still fires before the crop; a forced percent after
`COMPARE_ALLOW_GRID_MISMATCH` is a picture of those first rows only.

### 14.2 Band maps for the routes that fit in the crop

Home is section 13. These are the routes whose live body is under 2600 at
every width, so every band that exists is scored. Coordinates are live's, from
the same capture. A band map is not a fidelity claim (section 13.4).

#### `cart@1440` (body 1458)

| Bands | Region |
|---|---|
| 0 | top bar 38 + masthead 110 (inner-page shell, not home's 113+50) |
| 1-2 | cart table header + first lines |
| 2-4 | totals / proceed (Electro two-column from ~992) |
| 4-14 | store footer 1200 (`--container-store-footer`, not the 1430 home footer) |

Handheld cart (380) uses the 76+83 inner shell and the 355px footer without
newsletter. Scoring 380 against a 1440 cart PNG is a different footer.

#### `product@1440` (body 1967)

| Bands | Region |
|---|---|
| 0-1 | inner shell |
| 1-8 | gallery 470 + summary 700 (15px gap). ATC and buy-now sit here |
| 8-12 | tabs / description |
| 12-19 | related row. Live related carousel is **1** card; ours paints 4. That is a refuse (section 12.2 #5), not a band to restyle |

#### `category@1440` (body 1396)

| Bands | Region |
|---|---|
| 0 | collapsed sticky header in some snapshots (40px). Do not retune the home masthead to match a mid-scroll PNG |
| 1-2 | H1 + control bar |
| 2-13 | 5-up grid, card 234 × ~438 |

### 14.3 Standing rule, restated with the crop in mind

A refuse is still not a fail. Cropping does not turn a refuse into a number.
`COMPARE_ALLOW_GRID_MISMATCH=1` produces a forced percent of the **cropped**
picture, which for home@380 is three product photographs. Do not append that
number to section 2.1 as if it were geometry.

No `pnpm` in this worktree. No `compare.mjs` re-run this pass.

### 14.4 Independently re-derived, and one inference it licenses

The section 14 table was re-derived from `refs/ke_live_computed.json` directly
(`document.bodyScrollHeight` per capture, `min(2600, h) / h`), by a different
reader than the one who wrote it. **Every figure agrees**, to the percentage
point: 15 / 28 / 47 for home, 46 / 54 / 70 for shop, 83 / 88 / 100 for
checkout, 100 across the board for product, category, cart and account.

That is worth recording because the numbers are load-bearing for four
conclusions in 14.1 and they now have two independent derivations.

**The inference 14.1 stops short of: the crop is why 380 reads as volatile.**

Section 2.1 records `home@380` swinging between 11 and 28 percent and explains
it as "cards 3 and 4 are different products". True, and the deeper reason is
the crop:

| Width | Crop covers | What lives there |
|---|---|---|
| 380 | 14.6% of the page | shell, hero, the 31px strip, **and the first grid rows** |
| 1440 | 47.3% of the page | shell, hero, category strip, feature bar |

At 1440 the 2600px window lands almost entirely on **fixed chrome**, which is
stable between runs. At 380 the same window reaches the **catalogue**, which is
different products on the two sides. So:

> The home route did not become more volatile at 380. The window moved onto the
> volatile part of the page.

Two consequences:

1. **A 380 home score and a 1440 home score are not the same measurement**, and
   a rise from 8% to 42% between them is partly a change of subject rather than
   a responsive defect. Section 2.1's 2026-09-02 row should be read that way.
2. **Improving `home@380` means changing the first grid rows or seeding the
   catalogue**, not tuning the shell. The shell is barely a third of what that
   score sees, and it is already within 1 to 2px at every landmark (2.2.1).

## 15. Font swap vs the shutter, and search crop

`compare.mjs` waits for fonts and for zero pending images. A home pass is a
**Heebo** picture (`docs/DESIGN-SYSTEM.md` §12.2). Lighthouse LCP may still
name Arial (`display: swap`, `preload: false`). Those two numbers answering
different questions is not a regression.

`--page=search` live body is not in the 2026-09-04 seven-template capture
(section 11.1 lists home, shop, product, category, cart, checkout, account).
There is no pinned live height for search, so a search score cannot be
checked against 11.1. Treat search percents as refuse-or-forced only
(section 8). Do not invent a crop fraction.

`--page=account` is named in section 1 and **absent** from the script's
exit-2 list (section 12.1). Quote an `--page=account` run as a gate result
only after reading the script.

## 16. Live cards are flat, so elevation in the home crop is a known departure

`docs/DESIGN-SYSTEM.md` §1.5: 99.1% of live elements carry `box-shadow: none`.
Product cards have no shadow and `--radius-none` (`0px`). `--shadow-card` and
`--shadow-card-hover` are Electro, not live. They do not appear in the capture.

At `home@380` the 2600px crop is the hero plus **three deal cards** (section
13.3, section 14). Those three photographs are where a card lift would score.
A 28% home@380 is still catalogue images (section 2.1), not missing elevation.
Do not "fix" a home percent by adding or removing card shadows.

Diagnosis shortcut, added to section 13.4:

| Worst bands | Also look at |
|---|---|
| 9 and below at 1440, 12 and below at 768, 9 and below at 380 | Catalogue first. Then, only if geometry already matches, whether ours paints `--shadow-card-hover` on a card live leaves flat |

## 17. The shell offset, measured across all 21 captures

Sections 3 and 6 both invoke a "shell offset" between home and inner pages
without ever giving the numbers. Here they are, read off
`refs/ke_live_computed.json`: top bar height plus masthead height, per template
per width, on **live**.

| Template | 380 | 768 | 1440 |
|---|---|---|---|
| `home` | 113 + 50 = **163** | 38 + 50 = **88** | 38 + 110 = **148** |
| `cart` | 76 + 83 = **159** | 38 + 83 = **121** | 38 + 127 = **165** |
| `checkout` | 76 + 83 = **159** | 38 + 83 = **121** | 38 + 127 = **165** |
| `account` | 76 + 83 = **159** | 38 + 83 = **121** | 38 + 127 = **165** |
| `category` | 76 + 40 = **116** | 38 + 40 = **78** | 38 + 127 = **165** |
| `product` | 76 + 40 = **116** | 38 + 40 = **78** | 38 + 127 = **165** |
| `shop` | 76 + 40 = **116** | 38 + 40 = **78** | 38 + 127 = **165** |

### 17.1 There are three shell families, not two

At 380 and 768 the templates split three ways: home, the app pages
(cart / checkout / account), and the catalogue pages (category / product /
shop). Only at 1440 do they collapse to two.

**At 1440 the offset is a flat 17px**: home's masthead is 110 and every inner
page's is 127. That is the same 17px `docs/DESIGN-SYSTEM.md` records against
`--spacing-header-masthead`, arrived at from the other direction, so the two
agree.

**At 380 home is the tallest shell** (163) because of its three top-bar rows,
while the catalogue pages are the shortest (116). A page tuned to home's shell
starts 47px low on a category page at 380, which is half a band before anything
else has happened.

### 17.2 The 40px catalogue header is REAL. My artifact hypothesis was wrong.

An earlier revision of this section argued the 40px reading was probably a
scroll artifact: `measure-live-computed.mjs` sweeps the page before returning to
top, so a header that collapses on scroll and does not restore would be captured
collapsed. It named two ways to settle it. **One of them was run, against live,
on 2026-09-07.** The hypothesis does not survive.

Loaded the live category page and the live home page, read `#masthead` at
`scrollTop 0` **before scrolling at all**, then swept and re-read:

| Page | No scroll | After sweep | `position` |
|---|---|---|---|
| `category@380` | **h=40**, y=76 | h=40, y=76 | `static` |
| `category@1440` | h=127, y=38 | h=127, y=38 | `static` |
| `home@380` | h=50, y=113 | h=50, **y=91** | `static` |
| `home@1440` | h=110, y=38 | h=110, y=38 | `static` |

Three corrections fall out:

1. **The 40px is genuine.** Identical before and after the sweep. Live really
   does serve a 40px masthead on the catalogue pages at 380, against home's 50.
   The table in section 17 stands as measured.

2. **It is not a sticky header.** All four read `position: static`. Section 3
   describes this as "a collapsed sticky (40px at 380) vs home's 84px masthead";
   the number is right and the mechanism is not. Nothing is sticking or
   collapsing. These are different templates with different masthead heights.

3. ~~Something on home moves on scroll.~~ **RETRACTED, see 17.2a.** Nothing
   moves. The `y=91` reading behind this claim was taken before the scroll had
   settled.

### 17.2a Point 3 above was wrong, and the reason is worth keeping

The first probe read the masthead `y` as 113 cold and **91** after the sweep,
and concluded live's home top bar loses 22px on scroll. It does not.

Re-run with `window.scrollY` captured in the same evaluate as the geometry:

| | `scrollY` | masthead `y` | masthead `h` | top bar `h` | body |
|---|---|---|---|---|---|
| cold | 0 | 113 | 50 | 113 | 17791 |
| after sweep | 0 | **113** | 50 | 113 | 17791 |

Identical. The earlier `91` was read while the return to top was still settling:
the first probe slept 500ms after `scrollTo(0, 0)` and **did not record
`scrollY`**, so it had no way to know it was measuring mid-scroll.

**The methodological rule, which cost two retractions in this section to
learn: capture `scrollY` in the same `evaluate()` as any geometry read after a
scroll.** A `y` without its `scrollY` is not a position, and 500ms is not a
guarantee.

What survives from 17.2 is points 1 and 2, both of which were measured *before*
any scroll and are unaffected: the 40px catalogue header is real, and every
masthead measured is `position: static`.

#### A real asymmetry, found while checking this

Live's masthead is `position: static` at every width measured. **Ours is
`sticky top-0 z-40`** (`src/components/layout/Header.tsx:140`).

That is a genuine structural difference and it is *not* a systematic offset at
the shutter: `compare.mjs` returns both sides to `scrollTop 0` before the
screenshot, and a sticky header at scroll 0 sits exactly where a static one
does. It matters for anything measured **mid-page**, and for the manual QA
sweep, where our header overlays content on scroll and live's does not.

It is recorded here rather than in a defect list because sticky is very likely
the better behaviour; the point is that the two differ and no document said so.

Section 3's guidance ("shell stays tuned to home, do not collapse the header to
match a mid-scroll category PNG") survives all three corrections, for a better
reason than the one it was given: the category header is not mid-scroll, it is
simply a different template, and matching it would break home.

### 17.3 Why the offset matters more than its size

Every band below the shell inherits it. A 47px error at 380 does not stay 47px
of difference in one band; it shifts **the whole page** by half a band, so every
subsequent landmark lands in the wrong 100px bucket and the band report reads as
a diffuse page-wide mismatch rather than as one wrong number.

That is why section 2.1's honest statement for home@380 ("geometry is within
1-2px at every landmark") and its high percentage are not in conflict. Landmark
geometry and band alignment are different measurements, and the shell is what
converts a small error in the first into a large one in the second.

## 18. Band map: turning a band percentage into a diagnosis

`diff-bands.mjs` prints a percentage per 100px band and the twelve worst. The
log above records overall scores, so a reader who sees `y900-1000 42%` has no
way to know what is at y900. This maps band to page region, derived from
`refs/ke_live_computed.json` (committed 2026-09-04, live geometry at all three
widths), so a band number becomes a place.

Bands are 100px. The diff crops at **2600px**, so everything below band 25 is
never scored at any width.

### 18.1 `home@1440`, live body 5492px

| Bands | y | Region | Size |
|---|---|---|---|
| 0 | 0-38 | top bar | 1440x38 |
| 0-1 | 38-147 | masthead | 1200x109 |
| 1-7 | 148-761 | **hero row** | 1170x613 |
| 1-7 | 148-741 | side banners, 3 stacked | 201x197 each |
| 5-6 | 518-688 | category strip, 5-up | 728x170 |
| 7-8 | 761-895 | feature bar row | 1170x134 |
| 7-8 | 791-872 | feature bar content | 1170x81 |
| **8-25** | **898-2600** | **deal grid** (`jet-listing-grid__items grid-col-desk-4`) | 1150 wide, 4008px deep |

The grid begins at y898 and runs 4008px, so **every band from 9 to the 2600
crop is deal grid**. Eighteen of the twenty-six scored bands are catalogue.

### 18.2 `home@768`, live body 9409px

| Bands | y | Region | Size |
|---|---|---|---|
| 0 | 0-38 | top bar | |
| 0 | 38-87 | masthead (handheld) | 768x50 |
| 0-5 | 88-583 | **hero row** | 690x495 |
| 3-5 | 392-562 | category strip | 729x170 |
| 5-7 | 583-717 | feature bar row | 690x134 |
| 6 | 613-694 | feature bar content | 690x81 |
| 12-17 | 1220-1721 | deal card 1 | 335x501 |
| 17-22 | 1721-2222 | deal card 2 | 335x501 |
| 22-25+ | 2222-2723 | deal card 3 | 335x501 |

### 18.3 `home@380`, live body 17791px

| Bands | y | Region | Size |
|---|---|---|---|
| 1 | 113-162 | masthead (handheld) | 380x50 |
| 1-3 | 163-376 | **hero row** | 350x213 |
| 9-14 | 957-1505 | deal card 1 | 330x548 |
| 11 | 1109-1354 | card 1 image | 281x245 |
| 13 | 1386-1473 | card 1 price (`₪50 ₪20`) | 281x87 |
| 15-20 | 1505-2053 | deal card 2 | 330x548 |
| 16 | 1657-1902 | card 2 image | 281x245 |
| 19 | 1934-2021 | card 2 price (`₪5600 ₪3900`) | 281x87 |
| 20-25 | 2054-2602 | deal card 3 | 330x548 |
| 22 | 2206-2451 | card 3 image | 281x245 |
| 24 | 2483-2570 | card 3 price (`₪500 ₪250`) | 281x87 |

### 18.4 What the map explains

**One wrong product costs five or six whole bands at 380.** A card is 548px
tall there, which is 5.5 bands, and its image alone is 245px. Only three cards
fit inside the 2600px crop. So if card 2 differs between the two catalogues,
bands 15 to 20 go dark at once, and that is **six of the twenty-six scored
bands from a single product**.

That is the mechanism behind the home@380 row in section 2.1 reading "11.0% at
the line then 28.29%", and behind the honest statement under it that geometry
is within 1-2px at every landmark while the percentage lives in image bands. It
is not a hypothesis any more: three cards, six bands each, is most of the page.

**Shell offsets are cheap; grid offsets are not.** At 1440 the entire chrome
(top bar, masthead, hero, strip, feature bar) occupies bands 0 to 8. Everything
from band 9 down is catalogue. A one-band shell error moves 8 bands of chrome;
a one-row grid error moves 17.

**Diagnosis shortcuts:**

| Worst bands | Look at |
|---|---|
| 0-1 | top bar rows / masthead height. At 380 remember home has **three** top-bar rows and inner pages two |
| 1-7 (1440), 0-5 (768), 1-3 (380) | hero row height, then the slider inside it. Check the freeze took |
| 5-6 (1440), 3-5 (768) | category strip. Absent at 380 by design; if it appears there, that is the defect |
| 7-8 | feature bar. 31px empty strip at 380, flat 134px at both 768 and 1440 |
| 9 and below | **catalogue, not design.** Check the refusal guards in section 12 before touching a token |

**A band map is not a fidelity claim.** These are live's coordinates. If our
page puts the same element at a different y, the band that reports the
difference is where the element *should* be, not where ours is. Read the map to
find what region a band covers, then compare the two screenshots at that y.

### 18.5 Re-deriving it

```bash
python3 - <<'PY'
import json
d = json.load(open('refs/ke_live_computed.json'))
for w in (380, 768, 1440):
    c = d['captures'][f'home@{w}']
    print(f"--- home@{w}  body {c['document']['bodyScrollHeight']}px ---")
    for e in c['elements']:
        x, y, ww, hh = e['r']
        if y > 2600 or hh < 60 or ww < w * 0.35: continue
        cl = (e.get('c') or '')
        if any(k in cl for k in ('masthead','elementor-top-section','rs-module',
                                 'product-categories-list','feature',
                                 'jet-listing-grid__item','colophon')):
            print(f"  bands {int(y)//100:2}-{int(y+hh)//100:<3} y{int(y):5} {cl.split()[0][:34]:34} {int(ww)}x{int(hh)}")
PY
```

## 19. Systematic contributors: differences that are on every page at once

The per-route sections above record scores. This is the orthogonal list: known
differences between our page and live's that are **not** confined to one
element, so they appear in every band rather than in one. Each was measured in
the passes named.

| # | Difference | Live | Ours | Scope | Where measured |
|---|---|---|---|---|---|
| 1 | **Letter-spacing** | `-0.14px` on **92.4%** of elements, inherited from the root | `normal` (0) everywhere except three local declarations | every text run on every page | `docs/DESIGN-SYSTEM.md` 3.0b, pass 18 |
| 2 | **Shell height** | three families below 1440 (home / app / catalogue) | one shell | every band below the header, on every page | §17, pass 15 |
| 3 | **Header search field** | 534x41 at 1440, yellow top border | none, slot deleted | header band, every page | standing rule, §2.1 |
| 4 | **Card elevation** | flat: 99.1% of elements carry no `box-shadow` | Electro's `--shadow-card` pair | every card grid | `docs/DESIGN-SYSTEM.md` 1.5, pass 14 |
| 5 | **Header position** | `position: static` at every width | `sticky top-0 z-40` | mid-page only; not at the shutter | §17.2a, pass 17 |

### 19.1 Only three of the five reach the shutter

`compare.mjs` screenshots at `scrollTop 0`, so **#5 costs nothing in the gate**:
a sticky header at scroll 0 sits exactly where a static one does. It matters for
the manual sweep and for anything measured mid-page, and it is listed here so
nobody spends a pass chasing it in a band report.

**#3 is a decision, not a defect.** The standing rule is that there is no search
UI in the chrome, the pixel cost is accepted, and `MastheadNav.tsx` deleted the
slot rather than hiding it precisely so the cost is honest rather than a
DOM-shaped lie.

That leaves **#1, #2 and #4** as differences that are currently unpriced.

### 19.2 Why #1 is the one to look at first

The others are bounded. The shell offset is a fixed number of pixels at the top
of the page; the card shadow is confined to card edges. **Letter-spacing is
per character.**

A 40-character line is 5.6px wider on our side. That is usually invisible, and
occasionally it is the difference between a Hebrew paragraph wrapping to two
lines and to three, and a changed line count moves every block below it. So its
effect is not a uniform small offset, it is **zero on most elements and large on
the ones that happen to be near a wrap boundary**, which is exactly the profile
of a diffuse, hard-to-localise band mismatch.

None of this is a claim about how many points any of them is worth. **No number
here is measured, because the gate cannot run in this worktree.** They are
listed so that whoever can run it has a hypothesis list ordered by scope rather
than by how visible each one looks in a screenshot.

## 20. How to add a trustworthy row to this log

Section 13 says "append a dated row". This is what has to be true before that
row means anything. Every item is a trap this document already records, gathered
into the order you meet them.

### 20.1 Before the run

| # | Check | If it fails |
|---|---|---|
| 1 | Production build (`pnpm build`, then `PORT=3311 pnpm start`) | a dev build scores its own overlay |
| 2 | The server is **this** build: compare its start time to `.next/BUILD_ID` mtime | 45.53% and 11.07% were the same commit against two servers |
| 3 | No service worker registered on the origin | it survives branch switches and serves old chunks |
| 4 | Both catalogues seeded so the grids match | otherwise the run refuses (refusals 5 and 6) and refusing is correct |
| 5 | For `cart` / `checkout`, both sides seeded | refusals 2 and 3 |

### 20.2 During the run

Read the output, do not just take the last number.

| Signal | Meaning |
|---|---|
| `REFUSING to measure: …` + exit 3 or 4 | **not a score.** Record the refusal and its reason, never a percentage |
| `WARNING: styles never confirmed` | discard the run |
| `WARNING: the scroll/settle sweep … did not finish` | suspect; re-run |
| `!! HEIGHT RATIO Nx` | the two captures are different pages; the percentage is not a gate result |
| any `COMPARE_ALLOW_*` set | a **forced** number. Usable for reading unaffected bands, never against the 11% threshold |

### 20.3 What the row must carry

A percentage alone is not a row. The minimum:

```
| date | page | width | percent | build | notes |
```

- **All three widths, or say which are missing.** A 1440-only number has been
  presented as "the score" before, and 380 is the width that fails.
- **The build**, because check 2 above is the one that silently invalidates
  everything.
- **Whether any escape hatch was set.**

### 20.4 What a number cannot tell you

Before concluding a score is a design problem, rule out the five entries in
section 19. Three of them are on every page at once, and two of those three
(letter-spacing and shell height) are currently unpriced, so **some unknown part
of every score in this log belongs to them rather than to the route being
measured**.

That is not a reason to distrust the log. It is the reason section 19 exists,
and the reason a row should say what it measured rather than only what it
scored.

## 21. Section 2.2's landmarks, re-measured (pass 20)

Section 2.2 lists landmarks that "must not regress". Ten of the twelve numbers
reproduce exactly against `refs/ke_live_computed.json`. Two do not, and the
reason is a gap in the table rather than a defect in the numbers.

| Landmark | 380 | 768 | 1440 |
|---|---|---|---|
| Hero row, claimed | 213 | 495 | 613 |
| Hero row, **measured** | **213** | **495** | **613** |
| Columns, claimed | 1 | 2 | 4 |
| Columns, **measured** | **1** | **2** | **4** |
| Grid starts, claimed | 444 | 754 | 898 |
| Grid starts, **measured** (`jet-listing-grid__items`) | **409** | **719** | **898** |

Hero heights and column counts are exact at all three widths. Grid start is
exact at 1440 and **35px lower at both handheld widths** — the same 35 twice,
which is the signature of a different element rather than of drift.

### 21.1 The table does not name its selectors, so two numbers cannot be checked

At 1440, `jet-listing-grid__items` sits at y898 and the claim is 898. At 380 the
same selector sits at y409 against a claim of 444, and what is actually near y441
is a `jet-listing` label row 24px tall, with a link at y450 — a heading area, not
the card container.

So the original 444 measured *something*, consistently, 35px below the grid
container at both handheld widths. Without the selector there is no way to say
which element, and therefore no way to re-measure it or to know whether it has
regressed.

**That is the finding: a "must not regress" table whose rows carry no selector
is not enforceable.** The hero and column rows survived only because "the hero
row" and "how many cards fit across" are unambiguous.

### 21.2 What to do with it

Do **not** change 444 and 754 to 409 and 719. They may well be the right numbers
for the right element, and this pass cannot tell.

Add the selector to each row instead:

| Landmark | Selector to record |
|---|---|
| Hero row | `div.elementor-section.elementor-top-section` |
| Grid start | **unknown at 380/768**; `div.jet-listing-grid__items` gives 409 / 719 / 898 |
| Columns | first-row card count, `div.jet-listing-grid__item` |
| Feature bar | `div.feature` wrapper (31 empty strip at 380, 134 from 768) |

Then a later pass can settle 444 and 754 by measuring the named element rather
than guessing which one was meant.

This is the same lesson as `docs/QA-SCRIPTS.md` 0.2 and section 17.2a, in a
third costume: **a number without its provenance is not reproducible, and a
number nobody can reproduce cannot gate anything.**

## 22. Section 3's card geometry re-verified (pass 21)

Section 3 records category card geometry "ours / live … verified without a
score". The **live** column was re-measured against
`refs/ke_live_computed.json`, `div.product-outer` on the category template.

| Width | Claimed (live) | Measured | |
|---|---|---|---|
| 380 | x190 w175 | **x190 w175** | match |
| 768 | x499 w230 | **x499 w230** | match |
| 1440 | x1071 w234 | **x1071 w234** | match |

**Three of three, exact.** No caveat, no selector ambiguity: `product-outer` is
the card box and the numbers reproduce to the pixel.

### 22.1 Why this row verified cleanly and section 2.2's did not

Section 21 could not settle two of section 2.2's landmarks because the table
named no selector. This one settled immediately, and the difference is
instructive:

| | Section 2.2 "grid starts" | Section 3 card geometry |
|---|---|---|
| What it names | a **position** ("grid starts") | a **thing** (a card) |
| Candidate elements | the container, the first card, a heading wrapper, a padded inner | one: `div.product-outer` |
| Reproducible? | no, 35px ambiguity at two widths | yes, exactly, at three |

A landmark that names an **element** survives; a landmark that names a
**boundary** does not, because a boundary is between two things and the table
does not say which one it was measured from.

That is the concrete form of the rule section 21 proposes. It is not "add
selectors because it is tidy": it is that `x190 w175` is checkable years later
and `grid starts 444` is not.

### 22.2 What this does and does not confirm

It confirms the **live** column. The "ours" column
(380 x190 w175, 768 x519 w234, 1440 x1071 w234) cannot be checked here, because
that requires running our build, which this worktree cannot do.

So the 768 delta section 3 records — ours x519 w234 against live x499 w230, "20px
x, 4px w" — is **half verified**: live's side of it is exactly right, and
whether ours still differs by that amount is unknown. It was true when written.

## 23. Drift check on the refusal reference (pass 22)

Section 12 was read off `scripts/compare.mjs` in pass 12. Re-counted against the
script as it stands:

| Claim in section 12 | Script now | |
|---|---|---|
| Seven refusals at exit **3** | `process.exit(3)` x **7** | match |
| One refusal at exit **4** | `process.exit(4)` x **1** | match |
| One argument error at exit **2** | `process.exit(2)` x **1** | match |
| Four escape hatches | `COMPARE_ALLOW_GRID_MISMATCH`, `COMPARE_ALLOW_MOVING_HERO`, `COMPARE_ALLOW_PENDING_IMAGES`, `COMPARE_CART_EMPTY` | match |
| Two `WARNING:` lines in `compare.mjs` | **2** | match |
| One height-ratio banner in `diff-bands.mjs` | **1** | match |

**Zero drift.** The refusal reference still describes the script.

### 23.1 One naming detail, so a reader does not chase it

The script contains both `COMPARE_QUERY` and `COMPARE_SEARCH_Q`. They are not
two settings:

```
const COMPARE_QUERY = process.env.COMPARE_SEARCH_Q ?? 'אוזניות'
```

`COMPARE_SEARCH_Q` is the **environment variable**; `COMPARE_QUERY` is the local
constant holding its resolved value. Sections 6.6 and 12 document the former,
correctly. Setting `COMPARE_QUERY` in the environment does nothing.

The other four `COMPARE_*` names in the script
(`COMPARE_CATEGORY_SLUG`, `COMPARE_PRODUCT_SLUG`, `COMPARE_STORAGE_STATE`,
and the internal `COMPARE_LIVE_PNG` / `COMPARE_MINE_PNG` / `COMPARE_PAGE` passed
to the child process) are documented in section 6.6 or are implementation
detail of the per-process shot isolation.

## 24. Pricing contributor #1: letter-spacing (pass 23)

Section 19 lists letter-spacing as the first systematic contributor and calls it
unpriced. Measured, in a browser, on real Hebrew strings from this codebase at
14px:

| Sample | Chars | `normal` | `-0.14px` | Delta | |
|---|---|---|---|---|---|
| card title `תיק עור JEEP יוקרתי` | 19 | 119.02 | 116.38 | 2.64px | 2.22% |
| category `דילים חמים, עד 99` | 17 | 103.19 | 100.80 | 2.39px | 2.32% |
| cart empty `סל הקניות שלך ריק כרגע.` | 23 | 139.13 | 135.91 | 3.22px | 2.31% |
| checkout error (41 chars) | 41 | 253.17 | 247.42 | 5.75px | 2.27% |
| pending paragraph (65 chars) | 65 | 402.28 | 393.19 | 9.09px | 2.26% |

**Our text runs about 2.3% wider than live's at body size.** The delta is
`0.14px x character count`, so the percentage is stable across lengths and the
absolute number is not.

### 24.1 The effect shrinks as type grows

`-0.14px` is a **fixed px value inherited as computed** (`DESIGN-SYSTEM` 3.0b),
not an em. So it is 1% of the em at 14px and about 0.56% at the 25px PDP title.

| Role | Size | Spacing as % of em |
|---|---|---|
| body, cards, most UI | 14px | **1.0%** |
| section heading, PDP title | 25px | 0.56% |
| hero headline | 51px | 0.27% |

So the difference is **largest exactly where there is most text** and smallest on
the few large headings. That is the opposite of convenient: body copy is both
the most affected and the most likely to wrap.

### 24.2 Why 2.3% is not the same as 2.3% of the score

A 2.3% width difference does not produce a 2.3% pixel difference. It produces:

- **zero** difference on any line that still wraps identically, because the text
  starts at the same edge in RTL and the glyphs land within a couple of pixels;
- a **whole-line** difference wherever the extra 2.3% pushes a word past the
  wrap boundary, because one line becomes two and everything below shifts.

On a 186px card title column, 2.3% is about 4.3px, and a Hebrew word is
roughly 40px. So a wrap changes only where a line already ended within ~4px of
the edge. Most lines are unaffected; the ones that are not are affected
completely.

**That is the profile section 19 predicted** — "zero on most elements and large
on the ones near a wrap boundary" — now with a number behind it rather than an
argument.

### 24.3 What this does not settle

It prices the **input**, not the output. Turning 2.3% into points of the pixel
gate needs the gate, which this worktree cannot run. What it does establish:

- the difference is real and measurable, not theoretical;
- it is bounded — 2.3% at body size, less at every larger size;
- it cannot be dismissed as sub-pixel noise, because its failure mode is
  discrete (a wrap) rather than continuous.

Contributor #2, shell height, remains unpriced and is the more tractable of the
two: it is a fixed offset per template and section 17 already tabulates it.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Initial log: home, category, product, products, cart, checkout, search, account siblings; D4–D11 and STEP 46 numbers |
| 2026-09-07 | Pass 9: `/s/[id]` not scored; 2/3/4 grid; do not use join-us as twin |
| 2026-09-07 | Pass 10: `/city/[slug]` n/a (seventeen regions, no refs twin) |
| 2026-09-07 | Pass 11: legal indexable, `/offline` noindex, neither scored |
| 2026-09-07 | Pass 12: live reference heights pinned from the 2026-09-04 capture; renumbered the trailing section around a concurrent §12 |
| 2026-09-07 | Pass 12: refusal reference. All eight refusals with exit codes 2/3/4 and escape hatches, plus the three warnings that print an untrustworthy number instead of exiting |
| 2026-09-07 | Pass 13: band map derived from refs/ke_live_computed.json. Band to region at all three widths, and why one wrong product costs six of the twenty-six scored bands at 380 |
| 2026-09-07 | Pass 13: landmarks re-verified against the committed capture. Hero and feature bar confirmed exactly; bar-to-grid gap is 2.00px not 3px; "a landmark without a named element is not a landmark" |
| 2026-09-07 | Pass 14: crop arithmetic per route. Home@380 scores 15% of the page; cart/category/PDP are whole-page; checkout@380 can pass without reaching place-order |
| 2026-09-07 | Pass 15: shutter is Heebo, LCP may be Arial; search has no pinned live height; `--page=account` is not in the script's page list |
| 2026-09-07 | Pass 16: live cards are flat; card hover lift is an Electro departure inside the 11% budget, not a home@380 diagnosis |
| 2026-09-07 | Pass 15: shell offset measured across all 21 captures (§17). Three shell families below 1440, a flat 17px at 1440, and the 40px catalogue header flagged as a probable scroll artifact of the capture method. Band map renumbered to §18 |
| 2026-09-07 | Pass 16: settled 17.2 against live. The 40px catalogue header is REAL and not a capture artifact; the header is position:static everywhere, not sticky; and home alone loses 22px above the masthead on scroll |
| 2026-09-07 | Pass 17: RETRACTED the 22px scroll claim from pass 16. With scrollY verified at 0, nothing moves; the earlier reading was mid-scroll. Also: live is position:static, ours is sticky |
| 2026-09-07 | Pass 18: consolidated the systematic contributors (19). Five page-wide differences, three of which reach the shutter, ordered by scope; letter-spacing is per character and therefore the diffuse one |
| 2026-09-07 | Pass 19: the procedure for adding a trustworthy row (20). Five pre-run checks, five output signals that invalidate a score, and what a row must carry beyond a percentage |
| 2026-09-07 | Pass 20: re-measured the section 2.2 landmarks. Hero heights and column counts exact at all three widths; grid start exact at 1440 and 35px off at both handheld widths because the table names no selectors |
| 2026-09-07 | Pass 21: section 3 card geometry re-verified, three of three exact. It reproduced where section 2.2 could not, because it names an element rather than a boundary |
| 2026-09-07 | Pass 22: drift check on the refusal reference. Seven exit(3), one exit(4), one exit(2), four escape hatches, two warnings: all still match |
| 2026-09-07 | Pass 23: priced contributor #1. Our text is ~2.3% wider at body size, measured in a browser on real Hebrew strings; the effect shrinks as type grows and fails discretely at wrap boundaries |
