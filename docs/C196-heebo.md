# C196: Heebo preload

Item: preload the Heebo subset from `src/app/layout.tsx` (unlocked for C196 only), measure Lighthouse home at 380 before and after, keep the change only if LCP improves.

## The change that was measured

```diff
 const heebo = Heebo({
   variable: '--font-heebo',
-  subsets: ['latin', 'hebrew'],
   weight: ['300', '400', '500', '700', '900'],
   display: 'swap',
-  // LCP paragraph is Arial on purpose ([24]); do not preload Heebo onto that path.
-  preload: false,
+  // C196: preload only the Hebrew subset; Latin stays lazily matched by unicode-range.
+  preload: true,
+  subsets: ['hebrew'],
 })
```

It worked as intended. The after build sent one font preload in the document's Link header:

```
$ curl -sI http://localhost:3496/ | grep -i ^link
link: </_next/static/media/d0c0bfa28634aa91-s.p.3dq6enaul-s3b.woff2>; rel=preload; as="font"; crossorigin=""; type="font/woff2", </images/logo.svg>; rel=preload; as="image"
```

The Hebrew file started downloading at about 690 ms in the after runs, against about 1800 to 2060 ms before (the fonts column from the devtools runs).

## Method

- Mock build: `CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3496 pnpm build`, then `pnpm start` on 3496 with the same URL. Before and after are the same tree except `src/app/layout.tsx`.
- Lighthouse 13 from `node_modules/.bin/lighthouse`, performance only, mobile, `--screenEmulation.width=380 --screenEmulation.height=800 --screenEmulation.deviceScaleFactor=2`.
- 6 runs per side with `--throttling-method=devtools` (the honest local number) and 3 per side with `simulate` (Lantern). For the second batch of before runs the before build was rebuilt from HEAD.

## Lighthouse home 380

```
before-devtools-1 | perf=92 | FCP=1814 | LCP=3144 | SI=1907 | TBT=3 | CLS=0.023 | width=380 | throttling=devtools
before-devtools-2 | perf=91 | FCP=2000 | LCP=3214 | SI=2043 | TBT=4 | CLS=0.023 | width=380 | throttling=devtools
before-devtools-3 | perf=91 | FCP=2095 | LCP=3251 | SI=2135 | TBT=0 | CLS=0.023 | width=380 | throttling=devtools
before-devtools-4 | perf=92 | FCP=2010 | LCP=3085 | SI=2058 | TBT=10 | CLS=0.041 | width=380 | throttling=devtools
before-devtools-5 | perf=93 | FCP=1913 | LCP=3040 | SI=1955 | TBT=0 | CLS=0.023 | width=380 | throttling=devtools
before-devtools-6 | perf=93 | FCP=1875 | LCP=3050 | SI=1957 | TBT=1 | CLS=0.041 | width=380 | throttling=devtools
before-simulate-1 | perf=86 | FCP=1811 | LCP=3978 | SI=1811 | TBT=23 | CLS=0.021 | width=380 | throttling=simulate
before-simulate-2 | perf=81 | FCP=1809 | LCP=4940 | SI=1809 | TBT=21 | CLS=0.021 | width=380 | throttling=simulate
before-simulate-3 | perf=80 | FCP=1811 | LCP=5087 | SI=1811 | TBT=11 | CLS=0.021 | width=380 | throttling=simulate
after-devtools-1 | perf=92 | FCP=1887 | LCP=3092 | SI=1912 | TBT=4 | CLS=0.000 | width=380 | throttling=devtools
after-devtools-2 | perf=92 | FCP=1858 | LCP=3188 | SI=1876 | TBT=0 | CLS=0.000 | width=380 | throttling=devtools
after-devtools-3 | perf=91 | FCP=1837 | LCP=3282 | SI=1855 | TBT=1 | CLS=0.000 | width=380 | throttling=devtools
after-devtools-4 | perf=93 | FCP=1838 | LCP=3024 | SI=1861 | TBT=4 | CLS=0.000 | width=380 | throttling=devtools
after-devtools-5 | perf=92 | FCP=1895 | LCP=3116 | SI=1920 | TBT=0 | CLS=0.000 | width=380 | throttling=devtools
after-devtools-6 | perf=93 | FCP=1757 | LCP=3059 | SI=1776 | TBT=0 | CLS=0.000 | width=380 | throttling=devtools
after-simulate-1 | perf=87 | FCP=1508 | LCP=3976 | SI=1508 | TBT=17 | CLS=0.000 | width=380 | throttling=simulate
after-simulate-2 | perf=77 | FCP=2034 | LCP=5937 | SI=2034 | TBT=17 | CLS=0.000 | width=380 | throttling=simulate
after-simulate-3 | perf=81 | FCP=1510 | LCP=4954 | SI=1510 | TBT=16 | CLS=0.000 | width=380 | throttling=simulate
```


| devtools LCP, n=6 | before | after |
|---|---|---|
| median | 3114.5 ms | 3104 ms |
| mean | 3130.7 ms | 3126.8 ms |
| range | 3040 to 3251 | 3024 to 3282 |

Simulate LCP median: before 4940 ms, after 4954 ms.

The difference is 4 to 10 ms, and the run-to-run spread on each side is about 210 to 260 ms. LCP did not improve. Lantern's median went the other way.

The reason is the LCP element. It is not text on either build:

```
before: timeToFirstByte=7 resourceLoadDelay=1862 resourceLoadDuration=1255 elementRenderDelay=20
after:  timeToFirstByte=7 resourceLoadDelay=1862 resourceLoadDuration=1174 elementRenderDelay=49
LCP element (both): div.product-card > div.space-y-2 > a.relative > img.object-cover
```

LCP is a product card image with 1862 ms of resource load delay. Loading the font sooner cannot move that, so the item's premise does not hold at 380.

The preload did have one measured effect: CLS went from 0.023 to 0.041 before to 0.000 after (Heebo arrives before first paint, so the swap shift is gone). The item's rule is LCP only, so that does not count toward keeping it. It is written down here for the G23 perf work.

## compare.mjs home, before and after (UNLOCK condition)

```
| 2026-11-03 13:25 | home | 380 | 9.86% | PASS | `e09b72392` | ref everything loaded; overall 37.68% (reference blank 13.22%, ours blank 14.6%) |
| 2026-11-03 13:26 | home | 768 | 8.20% | PASS | `e09b72392-dirty` | ref everything loaded; overall 35.87% (reference blank 12.72%, ours blank 14.96%) |
| 2026-11-03 13:28 | home | 1440 | 6.55% | PASS | `e09b72392-dirty` | ref everything loaded; overall 24% (reference blank 8.85%, ours blank 8.6%) |
```

after (with the preload):

```
| 2026-11-03 13:35 | home | 380 | 9.86% | PASS | `e09b72392-dirty` | ref everything loaded; overall 37.68% (reference blank 13.22%, ours blank 14.6%) |
| 2026-11-03 13:37 | home | 768 | 8.20% | PASS | `e09b72392-dirty` | ref everything loaded; overall 35.87% (reference blank 12.72%, ours blank 14.96%) |
| 2026-11-03 13:39 | home | 1440 | 6.55% | PASS | `e09b72392-dirty` | ref everything loaded; overall 24% (reference blank 8.85%, ours blank 8.6%) |
```

Visual parity was the same to the hundredth at every width, so the visual gate would have allowed keeping it.

## Repo gates (after revert)

```
$ pnpm type-check
tc=0
$ pnpm lint
lint=0
$ node node_modules/vitest/vitest.mjs run
 Test Files  877 passed | 3 skipped (880)
      Tests  9698 passed | 39 skipped (9737)
```

## Decision

LCP did not improve, so per the item's rule the change was reverted. `src/app/layout.tsx` matches HEAD:

```
$ git diff --stat -- src/app/layout.tsx
(empty)
```

The item is still DONE. It asked for a measured keep-or-revert decision and that is what happened. The LCP lever at 380 is the lazy product card image's 1862 ms load delay, not the font.

RESULT: DONE
