# L2 Home parity: C03 (2026-10-29)

Command: `node scripts/compare.mjs --page=home --widths=380,768,1440` (first 2600px, `scripts/lighthouse` does not exist; compare.mjs is the gate tool).

| Width | Diff   | Gate (<11%) |
|-------|--------|-------------|
| 380   | 12.83% | FAIL |
| 768   | 13.8%  | FAIL |
| 1440  | 5.8%   | PASS |

## Why 380 and 768 fail
- Worst bands sit in the header and hero, which are locked files (HeroSection, HeroSlider, TopBar, MainHeader, Header, hero/**, header/**, topbar/**).
  - 380: y 100-400 are 18.6 / 55.3 / 33.1%.
  - 768: y 100-500 are 30.8 / 33 / 15.3 / 30.4%.
  - Together these account for roughly 4-5 points of the total at each width. Without them the 11% gate is not reachable.
- Below the hero, at 380 the product card at y 1700-1900 (45% / 26.1%) is the same card as the reference, shifted about 3px vertically. That shift accumulates from the page above (page height 18377 vs 17790). It is not an isolated grid-gap or image-size error.
- The reference render (`refs/localized/ke_live_home.html`) logs 153 failed loads (37 fonts), so its type metrics are not stable either.
- Supabase anon key in `.env.local` still returns 401 on `/rest/v1/` (unchanged since C51).

No source files were changed.

RESULT: BLOCKED locked-component C03 (380/768 fail mainly in header/hero bands)
