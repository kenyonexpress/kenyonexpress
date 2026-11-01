# C122 — COMPARE GATE REFERENCE

Reference: `refs/electro-home-v7.html` frozen captures (home); product/category use the page defaults from `scripts/parity-baseline.mjs`. Dev server `next dev -p 3317` against live Supabase (43 active products exist, so no demo seeding was needed; `supabase db query --linked` also hung and was not used).

Command (per page/width):
`COMPARE_ALLOW_PENDING_IMAGES=1 node scripts/compare.mjs --page=<home|product|category> --width=<w> --mine=http://localhost:3317/`

## Raw output (OVERALL first 2600px)
```
== home 380       46.26%
== home 768       41.03%
== home 1440      27.97%
== product 380    38.97%
== product 768    34.27%
== product 1440   25.01%
== category 380   43.98%
== category 768   41.67%
== category 1440  28.68%
```
Gate is under 11% on all nine: NOT MET (best 25.01%, worst 46.26%). Home matches C130 exactly (46.26/41.03/27.97).

## Why no CSS fix was applied
No code changed in this item. The top bands of every page are the locked header/topbar and (home) hero, which cannot be edited (`MainHeader.tsx`, `Header.tsx`, `HeroSection.tsx`, `TopBar.tsx`). They differ from the Electro reference (header icons, cart price, hero city strip; see C130) and account for the largest diff bands on all three pages. Non-locked body CSS alone cannot bring a page from 25–46% to under 11% while those bands stay mismatched. I did not iterate on body CSS to avoid unmeasured churn.

RESULT: BLOCKED locked-component (header/topbar/hero bands) + gate not met
