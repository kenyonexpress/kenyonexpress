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

## 11. What this pass did not re-run

No `pnpm`. No `compare.mjs`. No checkout of `closeout/v1-final`. No files under the main repo folder.

If a later agent can run the gate from the main checkout, append a dated row. Do not overwrite history.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Initial log: home, category, product, products, cart, checkout, search, account siblings; D4–D11 and STEP 46 numbers |
| 2026-09-07 | Pass 9: `/s/[id]` not scored; 2/3/4 grid; do not use join-us as twin |
| 2026-09-07 | Pass 10: `/city/[slug]` n/a (seventeen regions, no refs twin) |
| 2026-09-07 | Pass 11: legal indexable, `/offline` noindex, neither scored |
