# -*- coding: utf-8 -*-
import io, sys
def rep(path, old, new, count=1):
    s = io.open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == count, (path, old[:60], n)
    s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('ok', path)

# 7. HeroSlider welcome copy hooks
p = 'src/components/home/HeroSlider.tsx'
s = io.open(p, encoding='utf-8').read()
start = s.index('function WelcomeSlideCopy(')
end = s.index('function SlideCopy(')
w = s[start:end]
w0 = w
w = w.replace("""    <div
      className={`${RS.copyColumn} w-full pb-12 lg:w-1/2`}
      style={{ paddingTop: SLIDE.text.paddingTop }}
    >
      <h1 className={RS.headBox}>""",
"""    // The padding-top rides a custom property rather than an inline value so
    // src/styles/home-handheld.css can shrink it below 768px: an inline style
    // cannot be overridden by a media query. The hero-welcome-* classes are
    // hooks for the same stylesheet; above 1024px none of them do anything.
    <div
      className={`${RS.copyColumn} hero-welcome-copy w-full pb-12 pt-[var(--hero-copy-pt)] lg:w-1/2`}
      style={{ '--hero-copy-pt': `${SLIDE.text.paddingTop}px` } as React.CSSProperties}
    >
      <h1 className={`hero-welcome-head ${RS.headBox}`}>""")
w = w.replace("""className={`hero-headline block whitespace-nowrap font-light ${WELCOME_HEAD.line1}`}""",
"""className={`hero-headline hero-welcome-line1 block whitespace-nowrap font-light ${WELCOME_HEAD.line1}`}""")
w = w.replace("""className={`hero-headline mt-0.5 block whitespace-nowrap font-light lg:mt-1 ${WELCOME_HEAD.line2} ${""",
"""className={`hero-headline hero-welcome-line2 mt-0.5 block whitespace-nowrap font-light lg:mt-1 ${WELCOME_HEAD.line2} ${""")
w = w.replace("""className={`mt-4 lg:mt-5 ${RS.tagline}`}""", """className={`hero-welcome-tagline mt-4 lg:mt-5 ${RS.tagline}`}""")
w = w.replace("""className={`mt-3 text-end lg:mt-4 ${RS.promoSmallInset} ${RS.promoSmallWelcome}`}""",
"""className={`hero-welcome-promo-small mt-3 text-end lg:mt-4 ${RS.promoSmallInset} ${RS.promoSmallWelcome}`}""")
w = w.replace("""className={`mt-0 text-end ${RS.promoLargeInset} ${RS.promoLargeWelcome}`}""",
"""className={`hero-welcome-promo-large mt-0 text-end ${RS.promoLargeInset} ${RS.promoLargeWelcome}`}""")
assert w.count('hero-welcome-') == 8, w.count('hero-welcome-')
s = s[:start] + w + s[end:]
io.open(p, 'w', encoding='utf-8').write(s)
print('ok', p)

# 8. product card title pitch
rep('src/styles/product-card-deals.css',
"""  font-size: 22px;
  line-height: 32px; /* live: 2 clamped lines = 64px */
""",
"""  font-size: 22px;
  /* 26, not 32. Measured UX01 (14.10.2026) on refs/ke_live_1440.png: the two
     lines of "עוזרת אישית - שירותי משרד" pitch at 26px (y977 -> y1003) and ours
     at 32 (y980 -> y1012), which also put the first line 3px low through the
     half-leading. The 64px the old value was derived from is the WRAP's
     min-height above, which still holds the slot open; it was never the
     line box. 22 * 1.2 = 26.4, Electro's own ratio. */
  line-height: 26px;
""")

# 9. comments that said the local route never exists
rep('scripts/_image-fold-probe.mjs',
"""// --raw-images answers every /_next/image request with the raw file under
// public/. Locally the optimizer route does not exist at all (images.loader
// is 'custom', next-server.js skips the route) and every optimized image is a
// 404, so without this flag no image ever loads and the load-time shift and
// the real LCP element cannot be seen. The bytes are the originals, so sizes
// are wrong but ratios and layout are right.""",
"""// --raw-images answers every /_next/image request with the raw file under
// public/. It exists for builds with NEXT_PUBLIC_R2_IMAGES=1, where the
// optimizer route does not exist locally (images.loader is 'custom' and
// next-server.js skips the route) and every optimized image is a 404. With
// R2 off (the default since UX01, 14.10.2026) `pnpm start` serves the route
// itself and the flag is unnecessary. The bytes are the originals, so sizes
// are wrong but ratios and layout are right.""")
rep('docs/PERF-ARCHITECTURE-REPORT.md',
"""4 s after `load`). `--raw-images` exists because the local optimizer route does
not: `images.loader` is `'custom'` (STEP 22) and `next-server.js:198` skips
`/_next/image` for any loader but the default, so every optimized image on a
local `pnpm start` is a 404 and nothing above the fold ever loads. Production
answers 200 (Vercel serves the route itself). Image timings therefore belong to
a Vercel URL; what is pinned here is the markup and the layout.""",
"""4 s after `load`). `--raw-images` existed because the local optimizer route did
not: `images.loader` was `'custom'` (STEP 22) and `next-server.js:198` skips
`/_next/image` for any loader but the default, so every optimized image on a
local `pnpm start` was a 404 and nothing above the fold ever loaded. Production
answered 200 (Vercel serves the route itself). Since UX01 (14.10.2026) the custom
loader is installed only under `NEXT_PUBLIC_R2_IMAGES=1`, so a plain local
`pnpm start` serves the route again; the timings below predate that and belong
to a Vercel URL. What is pinned here is the markup and the layout.""")
