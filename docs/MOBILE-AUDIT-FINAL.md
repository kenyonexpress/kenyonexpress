# Mobile audit final (G24)

Measured 2026-10-25 with `scripts/mobile-audit.mjs` against the Next server on http://localhost:3311 (next-server 16.4.2, cwd kenyonexpress-web/kenyonexpress, branch closeout/v1-final). Raw rows: `docs/mobile-audit/results.json`, screenshots `docs/mobile-audit/<page>-<width>.png`.

Overflow = documentElement.scrollWidth minus clientWidth. 0 = no sideways scroll.

Result: 42 measurements (14 pages x 3 widths), 42 HTTP 200, 42 with overflow 0.

| page | path | 380 | 390 | 430 | status | final path |
|---|---|---|---|---|---|---|
| home | / | 0 | 0 | 0 | 200 | / |
| products | /products | 0 | 0 | 0 | 200 | /products |
| category | /category/hot-deals | 0 | 0 | 0 | 200 | /category/hot-deals |
| product | /product/%D7%9E%D7%95%D7%A6%D7%A8-%D7%9C%D7%93%D7%95%D7%92%D7%9E%D7%90 | 0 | 0 | 0 | 200 | /product/%D7%9E%D7%95%D7%A6%D7%A8-%D7%9C%D7%93%D7%95%D7%92%D7%9E%D7%90 |
| cart | /cart | 0 | 0 | 0 | 200 | /cart |
| checkout | /checkout | 0 | 0 | 0 | 200 | /checkout |
| cities | /c | 0 | 0 | 0 | 200 | /c |
| city-tel-aviv | /c/tel-aviv | 0 | 0 | 0 | 200 | /c/tel-aviv |
| suppliers | /suppliers | 0 | 0 | 0 | 200 | /suppliers |
| login | /login | 0 | 0 | 0 | 200 | /login |
| signup | /signup | 0 | 0 | 0 | 200 | /signup |
| terms | /terms-and-conditions | 0 | 0 | 0 | 200 | redirects to /terms |
| privacy | /privacy-policy | 0 | 0 | 0 | 200 | redirects to /privacy |
| accessibility | /accessibility | 0 | 0 | 0 | 200 | /accessibility |

## Changes

- `scripts/mobile-audit.mjs`: waits for `load` and retries the measurement when a redirect destroys the execution context (the terms and privacy redirects crashed the run). No UI code changed; no forbidden file touched.

## Caveats

- The server on 3311 is a long-running process started 2026-10-24 18:09; it may predate recent working-tree edits.
- The product row uses the placeholder slug from the script; it returns 200 but may be the not-found template, not a real product. Real product pages share the same layout shell.
- Widths below 380 are out of scope (Z14 found /signup, /forgot-password and /reset-password at 336px in a 320px viewport).
- compare.mjs visual gate not part of this item; no UI code changed.
