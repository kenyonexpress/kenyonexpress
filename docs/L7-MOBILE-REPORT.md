# L7 Mobile shell 380px: C08 (2026-10-25)

Branch: closeout/v1-final. Result: BLOCKED (sideways-scroll criterion met, compare gate not met).

Server: production build, `next start -p 3311`. Playwright, Chromium, viewport 380x844.

## 1. Zero sideways scroll: PASS

`node scripts/mobile-audit.mjs` (14 pages x 380/390/430): 42 measurements, 42 HTTP 200, 0 with overflow
(`documentElement.scrollWidth - clientWidth`).

Stricter per-element check at 380 (any element whose box leaves 0..380 and is not inside an
overflow-clipping ancestor): `html` and `body` are both `overflow-x: visible`, so nothing is being hidden to hit
the zero. The only element past the edge is the closed mobile nav drawer (`fixed`, `start-0`, 380..660, off-canvas),
which cannot scroll the page. `scrollWidth` is 380 on all 14.

| page | path | overflow at 380 |
|---|---|---|
| home | / | 0 |
| products | /products | 0 |
| category | /category/hot-deals | 0 |
| product | /product/<slug> | 0 |
| cart | /cart | 0 |
| checkout | /checkout | 0 |
| cities | /c | 0 |
| city | /c/tel-aviv | 0 |
| suppliers | /suppliers | 0 |
| login | /login | 0 |
| signup | /signup | 0 |
| terms | /terms | 0 |
| privacy | /privacy | 0 |
| accessibility | /accessibility | 0 |

## 2. compare.mjs gate (<11%): FAIL

Command: `LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=<p> --width=<w> --baseline=<electro png>`
(product with `COMPARE_ALLOW_GRID_MISMATCH=1`, baseline `electro-product-fresh_<w>.png`).

| page | 380 | 768 | 1440 |
|---|---|---|---|
| home | 46.03% | 41.29% | 29.72% |
| product | 42.73% | 33.85% | 22.89% |
| /c, /c/<slug> | not measurable | not measurable | not measurable |

- The anon Supabase key answers 200 now, so this is not the C03/C04 missing-data cause. The numbers did not
  improve much because the cause is structural: `scripts/parity-baselines.json` documents that the Electro
  snapshot is JS-less (96 dropped requests), so its body is 18146px tall at 380 against 5492px at 1440. Best
  known home figures are 30.26 / 29.0 / 8.29, i.e. the 11% gate is unreachable at 380 and 768 against this reference.
- Home at all three widths is also worse than best known (tolerance 0.5). The top of the page is the locked
  header/hero, which this item may not touch, so the regression cannot be narrowed from below the hero.
- `/c` and `/c/<slug>` have no Electro reference and no `--page` mode in compare.mjs, so there is nothing to score.
- Product still logs `product_detail.supplier_load_failed` (42703, `suppliers.verification_status` missing), so the
  supplier block is absent. Fix is a migration in migrations/pending/ applied via Supabase MCP (not authenticated here).

## 3. Changes

- `scripts/compare.mjs`: the browser context now sets `bypassCSP: true`. Against any production build the script
  crashed at `addStyleTag` (CSP `style-src 'self' 'nonce-...'`) before scoring. This is harness-only; the app's CSP is unchanged.
- No application code changed. No forbidden file touched.

## 4. Next

1. Capture a JS-complete Electro v7 reference (or add /c and /c/<slug> baselines and page modes), then re-score.
2. Apply the `suppliers.verification_status` migration.
