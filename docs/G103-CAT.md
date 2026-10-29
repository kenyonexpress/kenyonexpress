# G103 — CATEGORY-ELECTRO parity (/c/[slug])

Result: BLOCKED (gate fails at all three widths; no page code changed).

## Findings (2026-10-30)
- `/c/[slug]` is `src/app/(store)/c/[slug]/page.tsx` (134 lines, not a locked file). The city branch renders breadcrumb,
  title, `CategoryFilterChips` and `ChipFilteredCityGrid`. A category slug redirects to `/category/<slug>`, so the
  category archive is a separate route (see docs/C03-CATEGORY-PARITY.md).
- `ChipFilteredCityGrid` has chips but no sort control and no infinite scroll. `CategoryControlBar` and
  `CategoryGridWithInfiniteScroll` exist under `src/components/category/` but are not wired into `/c/[slug]`.
- `compare.mjs --page=category` targets `/category/<slug>`. G103 measured `/c/tel-aviv` with `--mine=`, on a
  production build (`pnpm build && pnpm start`). On `next dev` the shot crashes with "Execution context was destroyed".
- Without overrides the gate refuses: reference shows 2 cards, local 5. Measured with
  `COMPARE_ALLOW_PENDING_IMAGES=1 COMPARE_ALLOW_GRID_MISMATCH=1`.

## Gate (first 2600px, vs refs/localized/ke_live_category.html)
| width | diff | <11% gate |
|-------|------|-----------|
| 380   | 19.44% | FAIL (passes the item's own 25% mobile target) |
| 768   | 12.90% | FAIL |
| 1440  | 11.36% | FAIL |

Worst bands at 380: y 500-600 (55.8%), y 900 (47.5%), y 1200 (35.3%), y 800 (30.1%).

## Not done
Wiring sort + infinite scroll into the city grid and closing the 0.4-8.4 point gaps to 11%. The reference is the
degraded WordPress snapshot with a 2-card grid, so part of each number is reference noise. No passing measurement
exists, so DONE would be false.

RESULT: BLOCKED parity 19.44/12.90/11.36 vs 11% gate; sort + infinite scroll not wired
