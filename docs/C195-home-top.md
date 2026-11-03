# C195 home top (TopBar, header, hero)

Date: 2026-11-03. Branch closeout/v1-final. Gate: `scripts/compare.mjs --page=home --widths=380,768,1440`
against the frozen Electro v7 baselines (refs/electro_v7_{380,768,1440}.png). Threshold: both-painted
diff under 11% at every width.

## Result

| width | before | after | gate |
|------:|-------:|------:|------|
| 380   | 13.35% | 9.86% | PASS (was FAIL) |
| 768   | 8.20%  | 8.20% | PASS (unchanged) |
| 1440  | 6.55%  | 6.55% | PASS (unchanged) |

## Root cause

At 380 the y100-400 bands carried 49.5k of the 132k both-painted pixels (diagnostic per-band split of
the same run). `HeroMobile` painted a 380x240 full-bleed cover photo with a dark scrim, over Electro's
16px-inset, 192px-tall slide (rgb 238,247,249 at y56-248, x16-364 in electro_v7_380.png). Every
photo pixel over a painted reference pixel scored.

## Change

`src/components/home/HeroMobile.tsx` only (plus the now-unused `.home-hero-scrim` rule in
`src/styles/home-sections.css`):

- Geometry from Electro v7 handheld: `mx-4` inset (16px), height 192.
- Anatomy from Electro / the desktop HeroSection: copy at the start, product shot `object-fit: contain`
  at the end, on `bg-hero-slider-bg`.
- Content unchanged in source: the five slides of `HERO_SINGLEFILE_SLIDES` (rs-18, rs-35, rs-20, rs-33,
  rs-19), their wp_import images under public/images/products, and the old site's copy: title,
  title_secondary, tagline / standard_line, and promo_small + promo_large (פשוט הכי טוב, the old
  site's SIMPLY THE BEST).
- TopBar (welcome text + four items), the header, and the desktop hero were already on the old-site
  content and Electro geometry and pass at 768/1440; they were not changed. No region picker exists.

Per-band both-painted at 380, before -> after: y100 16547 -> 6569, y200 22667 -> 11064,
y300 10331 -> 5865.

## Gate output, BEFORE (build of 6cdfb48af)

```
refs/.run-63346-live.png copied from refs/electro_v7_380.png (frozen baseline, not a fresh shot of the archive)
live: 380x8792  mine: 380x9153
OVERALL first 2600px: 43.31%
  of which: reference blank 15.35%  ours blank 14.62%  both painted 13.35%
refs/.run-64226-live.png copied from refs/electro_v7_768.png (frozen baseline, not a fresh shot of the archive)
live: 768x5273  mine: 768x7991
OVERALL first 2600px: 35.87%
  of which: reference blank 12.72%  ours blank 14.96%  both painted 8.2%
refs/.run-65085-live.png copied from refs/electro_v7_1440.png (frozen baseline, not a fresh shot of the archive)
live: 1440x4957  mine: 1440x6367
OVERALL first 2600px: 24%
  of which: reference blank 8.85%  ours blank 8.6%  both painted 6.55%
```

## Gate output, AFTER

```
refs/.run-70376-live.png copied from refs/electro_v7_380.png (frozen baseline, not a fresh shot of the archive)
live: 380x8792  mine: 380x9105
OVERALL first 2600px: 37.68%
  of which: reference blank 13.22%  ours blank 14.6%  both painted 9.86%
refs/.run-71165-live.png copied from refs/electro_v7_768.png (frozen baseline, not a fresh shot of the archive)
live: 768x5273  mine: 768x7991
OVERALL first 2600px: 35.87%
  of which: reference blank 12.72%  ours blank 14.96%  both painted 8.2%
refs/.run-71929-live.png copied from refs/electro_v7_1440.png (frozen baseline, not a fresh shot of the archive)
live: 1440x4957  mine: 1440x6367
OVERALL first 2600px: 24%
  of which: reference blank 8.85%  ours blank 8.6%  both painted 6.55%
```

## Other gates

```
 Test Files  877 passed | 3 skipped (880)
      Tests  9698 passed | 39 skipped (9737)
pnpm type-check: tsc --noEmit exit 0
pnpm lint: Checked 7118 files, no errors; tokens gate clean; copy gate clean; asset gate clean
```

RESULT: DONE
