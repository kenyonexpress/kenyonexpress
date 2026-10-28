# PARITY-FINAL (G05) — 2026-10-29

**RESULT: BLOCKED.** Gate is under 11% at 380/768/1440 on home, product, /c, /c/<slug>. It is not met, and no CSS-only fix inside the allowed paths can meet it.

Reference: `refs/electro-home-v7.html` (home), `refs/electro-product-fresh.html` (product). Tool: `scripts/compare.mjs` (OVERALL, first 2600px). No code was edited in this item. No locked file was touched.

| Page | 380 | 768 | 1440 |
|---|---|---|---|
| home | 39.85% FAIL | 36.59% FAIL | 27.52% FAIL |
| product | 23.40% FAIL | 21.93% FAIL | 16.50% FAIL |
| /c | n/a (no reference) | n/a (no reference) | n/a (no reference) |
| /c/<slug> | n/a (no reference) | n/a (no reference) | n/a (no reference) |

Only 6 of the 12 cells have a number. The other 6 cannot be produced honestly, so none was invented.

Sources: home = M01-c267 (valid 200 run, matches c264). Product = M02-c266 / run `b2baf519` (23.33/21.93/16.50 at 380/768/1440 in c266). Both are logged in `docs/UI-PARITY-REPORT.md`.

## Why this is BLOCKED
1. **No reference for /c and /c/<slug>.** `refs/` holds only Electro home-v7 and product-fresh. `compare.mjs --page=category` refuses at all three widths because its live side is our own build. See `docs/PARITY-REFERENCE.md`.
2. **Structure differs, not just styling.** Home page height ratio vs reference is 2.10x at 380 and 1.71x at 768. Product has a grid-count mismatch. CSS-only fixes cannot close gaps of 16–40 points.
3. **The allowed paths do not exist.** `src/app/page-sections/*`, `src/components/products/*` and `src/components/categories/*` are absent. The real directories are `src/components/home`, `product` and `category`. The home hero and header components there (HeroSection, HeroSlider, Header and others) are on the forbidden list, and they dominate the top of the measured band.
4. **Lighthouse is not the gate.** The gate is `compare.mjs`. Lighthouse is installed, but it measures performance, not pixel parity with the reference.

## To unblock
Add an Electro category archive HTML and a category-product HTML to `refs/`. Then do the structural work on the non-locked home sections, which needs more than CSS.
