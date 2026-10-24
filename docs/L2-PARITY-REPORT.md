# L2 Home parity: C03 (2026-10-25)

Command: `node scripts/compare.mjs --page=home --widths=380,768,1440` (first 2600px, prod build via `next start`).

| Width | Diff | Best known | Gate (<11%) |
|-------|--------|------------|-------------|
| 380   | 49.9%  | 30.26%     | FAIL |
| 768   | 42.77% | 29%        | FAIL |
| 1440  | 31.72% | 8.29%      | FAIL |

## Cause
Not a CSS/grid/font regression. The Supabase anon key in `.env.local` returns HTTP 401 on `/rest/v1/`,
so the home page renders without its product data. The worst bands (y 1100-1900 at 1440) are the product
sections. At 380 compare also reports a height ratio of 0.31x (structurally different pages).
Adjusting grid gaps, image sizes or font clamps cannot fix missing data, so no layout files were changed.

## Next
Re-run after the Supabase keys in `.env.local` are replaced (the C51 recovery), then narrow whichever width still fails.
