# C172 HOME TOP: header + hero + category menu + brand strip + newsletter + footer (2026-11-03)

RESULT: BLOCKED locked-component C172

## Why

The item asks to build the header and the hero. Both are locked components
(iron rules, FORBIDDEN FILES: Header, TopBar, MainHeader, HeroSection,
HeroSlider, header/**, topbar/**, hero/**; same set as LOCKED_COMPONENTS.md
used by C01, C138, M01-c348). The rule for this case is: "If item requires
editing any of these, write BLOCKED locked-component <item>, continue next."

Building a replacement header/hero in a new file and swapping the import in
`src/app/(store)/layout.tsx` or `page.tsx` would replace the locked
components by another route, so that was not done.

Two more conflicts in the item text, recorded and not acted on:
- colours #FDB813 + #283A97 contradict the locked token primary yellow #fed700;
- "layout from refs/band-home-*.png" (old WordPress screenshots) contradicts
  "old site is CONTENT SOURCE ONLY, never copy its layout".

## Evidence (command output)

```
$ grep -n "Header\|Hero" "src/app/(store)/layout.tsx" "src/app/(store)/page.tsx" src/components/layout/SiteHeader.tsx
src/app/(store)/layout.tsx:4:import SiteHeader from '@/components/layout/SiteHeader'
src/app/(store)/page.tsx:1:import CmsHero from '@/components/home/CmsHero'
src/app/(store)/page.tsx:3:import HeroMobile from '@/components/home/HeroMobile'
src/app/(store)/page.tsx:4:import HeroSection from '@/components/home/HeroSection'
$ grep -n "^import" src/components/layout/Header.tsx
3:import MastheadNav from '@/components/layout/MastheadNav'
5:import TopBar from '@/components/layout/TopBar'
$ sed -n 256,271p docs/C138-parity.md
## Why the gate cannot pass without locked files (proof, home 380)
Element boxes on / at 380 (Playwright, same server):
```
0-113    div (TopBar, src/components/layout/TopBar.tsx — LOCKED)
113-162  header (MainHeader/Header — LOCKED)
162-402  section (hero row: HeroMobile mounted with HeroSection — "only work BELOW the hero row", LOCKED_COMPONENTS.md)
402-898  section.home-deal-of-day
```
Bands 0-400 at 380 are entirely topbar + header + hero row: 60.3 + 62.4 + 100 + 98.2 = 320.9 over 26 bands = **12.34 percentage points** of OVERALL.
Even if every band below the hero row were a 0% diff, home 380 would be ≥ 12.34% > 11%. The gate is unreachable at home 380 without editing locked files. Since the gate requires all three pages at all three widths, C138 cannot be DONE.

Header band y0-100 is also 57–62% on product/category at 380/768 (same locked TopBar/MainHeader).

No code changes in this item; no forbidden files touched.

RESULT: BLOCKED locked-component (home 380 topbar+header+hero bands alone = 12.34pt > 11% gate)
```

Latest full home measurement on this branch (docs/M01-c348.md, 2026-11-02,
prod build): home 44.16 / 36.73 / 23.88 % at 380 / 768 / 1440. The 0-400 px
bands at 380 (topbar + header + hero row, all locked) contribute 12.34 points
by themselves, above the 11 % gate even if everything below were 0 %.

No screenshots were taken to docs/C172-home/ and compare.mjs was not re-run:
no code changed, so the 2026-11-02 numbers stand.

No code changes; no forbidden files touched.

RESULT: BLOCKED locked-component C172
