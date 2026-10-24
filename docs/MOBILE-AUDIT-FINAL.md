# Mobile audit final (Z15)

Measured 2026-10-23 on branch closeout/v1-final with `scripts/mobile-audit.mjs` against the production server on http://localhost:3311 (next-server 16.4.2). Raw rows: `docs/mobile-audit/results.json`.

Overflow = documentElement.scrollWidth minus clientWidth. 0 = no sideways scroll.

Result: 42 measurements (14 pages x 3 widths), 42 HTTP 200, 42 with overflow 0.

| page | path | 380 | 390 | 430 | status | final path |
|---|---|---|---|---|---|---|
| home | / | 0 | 0 | 0 | 200 | / |
| products | /products | 0 | 0 | 0 | 200 | /products |
| category | /category/hot-deals | 0 | 0 | 0 | 200 | /category/hot-deals |
| product | /product/%D7%9E%D7%95%D7%A6%D7%A8-%D7%9C%D7%93%D7%95%D7%92%D7%9E%D7%90 | 0 | 0 | 0 | 200 | same |
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

## Caveats

- The server on 3311 was started 17:24 and `.next/BUILD_ID` is from 18:41, so the running process may predate the latest build in the working tree. Not rebuilt here (ONE code agent rule, other runs in flight).
- Widths below 380 are out of scope. Z14 found /signup, /forgot-password and /reset-password at 336px wide in a 320px viewport; that is not covered by this audit.
- Visual gate (compare.mjs under 11 pct) not part of this item; no UI code changed.
