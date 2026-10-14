# -*- coding: utf-8 -*-
import io, sys
def rep(path, old, new, count=1):
    s = io.open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == count, (path, old[:60], n)
    s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('ok', path)

# 1. next.config.ts: the R2 loader only when R2 is on; Next's own optimizer otherwise
rep('next.config.ts',
"""    /**
     * One loader for every image on the site, and it is Next's own loader
     * with one addition: with NEXT_PUBLIC_R2_IMAGES=1 a stored
     * `/images/products/*` or `/images/cdn/*` path is fetched by the
     * optimizer from the signed R2 proxy (src/app/images/r2) instead of from
     * public/. Byte-equal to the default for everything else; the test next
     * to the file pins that, because a loader is in the path of every
     * product photo and a drift here is a drift on every page.
     */
    loader: 'custom',
    loaderFile: './src/lib/images/loader.ts',
""",
"""    /**
     * One loader for every image on the site, and it is Next's own loader
     * with one addition: with NEXT_PUBLIC_R2_IMAGES=1 a stored
     * `/images/products/*` or `/images/cdn/*` path is fetched by the
     * optimizer from the signed R2 proxy (src/app/images/r2) instead of from
     * public/. Byte-equal to the default for everything else; the test next
     * to the file pins that, because a loader is in the path of every
     * product photo and a drift here is a drift on every page.
     *
     * INSTALLED ONLY WHEN R2 IS ON (UX01, 14.10.2026). `next-server.js:198`
     * answers every `/_next/image` request with a 404 for any loader but
     * `'default'`, so from STEP 22 until here a local `pnpm start` served no
     * optimized image at all: the logo, the hero placeholder, the category
     * tiles and every product photo rendered as a broken image, the header
     * flex collapsed around a 35px logo box, and the parity gate measured a
     * page a quarter blank. Production never noticed because Vercel serves
     * the route itself. With R2 off the custom loader emits byte-identical
     * URLs to Next's own, so there is nothing to install; with it on, the
     * re-homing is the whole point and the local 404 is the known price.
     * Next refuses `loaderFile` under any other loader, hence the spread.
     */
    ...(process.env.NEXT_PUBLIC_R2_IMAGES === '1'
      ? { loader: 'custom' as const, loaderFile: './src/lib/images/loader.ts' }
      : {}),
""")

# 2. sidebar: the list starts 7px below the yellow bar on live
rep('src/components/home/HeroCategorySidebar.tsx',
"""          <ul
            className="dropdown-menu yamm m-0 list-none p-0"
            style={{ borderWidth: 0, borderRadius: 0 }}
          >""",
"""          <ul
            className="dropdown-menu yamm m-0 list-none p-0"
            // paddingTop 7: measured on refs/ke_live_1440.png (UX01, 14.10).
            // The yellow bar ends at y196 on both sides, but live's first row
            // rule sits at y237 and ours sat at y230 -- every rule below it
            // was 7px high, through the last one (552 vs 545). The rows
            // themselves pitch at 35px on both, so the whole drift is the gap
            // between the bar and the first row: Bootstrap's `.dropdown-menu`
            // 5px block padding plus the border it keeps and we zero.
            style={{ borderWidth: 0, borderRadius: 0, paddingTop: 7 }}
          >""")

# 3. usp tokens: measured cell geometry
rep('src/lib/electro-hero-tokens.ts',
"""   * paddingBlock kept as em (relative to the 16px row font-size) to reproduce
   * the exact measured row height without a magic pixel constant.
   */
  uspBar: {
    maxWidth: 1170,
    borderColor: '#ddd',
    borderRadius: 8,
    gap: 10,
    paddingInline: 16,
    paddingBlockStart: '1.357em',
    paddingBlockEnd: '0.929em',
""",
"""   * REMEASURED UX01 (14.10.2026) against refs/ke_live_{768,1440}.png: the live
   * cell is 81px outer (1 + 19 + 47 + 13 + 1) at both widths and ours was 74,
   * with the text block starting 5px too high. The em padding was computed
   * off a 16px row font, which is not what Electro does: `.feature` is
   * 1.357em/0.929em of a 14px font, i.e. 19px and 13px, and the two text
   * lines sit at line-height 1.6 (15 * 1.6 + 13 * 1.6 + 2 = 46.8), not
   * `leading-tight`. Pixels, because the measurement is in pixels.
   *
   * mdWidth: at 768 live's `.features-list` spans x39..x728, 690px, inside
   * the 750px Bootstrap container with its 15px padding and a further 15px
   * list margin. Ours ran the full 768 with no page inset at all.
   */
  uspBar: {
    maxWidth: 1170,
    mdWidth: 690,
    borderColor: '#ddd',
    borderRadius: 8,
    gap: 10,
    paddingInline: 16,
    paddingBlockStart: 19,
    paddingBlockEnd: 13,
    lineHeight: 1.6,
""")

# 4. BenefitBar: md width + line-height
rep('src/components/home/BenefitBar.tsx',
"""      <div className="mx-auto hidden w-full md:block" style={{ maxWidth: USP.maxWidth }}>""",
"""      <div
        className="mx-auto hidden w-full md:block md:w-[var(--usp-md-w)] lg:w-full"
        style={{ maxWidth: USP.maxWidth, '--usp-md-w': `${USP.mdWidth}px` } as React.CSSProperties}
      >""")
rep('src/components/home/BenefitBar.tsx',
"""                  <div
                    className="leading-tight"
                    style={{
                      fontSize: USP.title.size,
                      fontWeight: USP.title.weight,
                      color: USP.title.color,
                    }}
                  >""",
"""                  <div
                    style={{
                      fontSize: USP.title.size,
                      fontWeight: USP.title.weight,
                      lineHeight: USP.lineHeight,
                      color: USP.title.color,
                    }}
                  >""")
rep('src/components/home/BenefitBar.tsx',
"""                  <div
                    className="leading-tight"
                    style={{
                      fontSize: USP.subtitle.size,
                      fontWeight: USP.subtitle.weight,
                      color: USP.subtitle.color,
""",
"""                  <div
                    style={{
                      fontSize: USP.subtitle.size,
                      fontWeight: USP.subtitle.weight,
                      lineHeight: USP.lineHeight,
                      color: USP.subtitle.color,
""")

# 5. HeroSection: page inset below lg, 194px slider box on a phone
rep('src/components/home/HeroSection.tsx',
"""      className="mx-auto flex h-hero-mobile w-full max-w-hero-row flex-col border-b border-border font-sans md:h-hero-tablet lg:h-hero-desktop lg:flex-row lg:items-stretch"
    >""",
"""      // px-gutter / md:px-[39px] / lg:px-0: live keeps its Bootstrap container
      // below lg, so the slider, the strip and the feature bar all sit inside
      // a 15px gutter at 380 (slider x15..x365) and 39px at 768 (x39..x728:
      // 9px of centring, 15px container padding, 15px list margin). Ours
      // bled edge to edge at both. Measured UX01, 14.10.2026.
      className="mx-auto flex h-hero-mobile w-full max-w-hero-row flex-col border-b border-border px-gutter font-sans md:h-hero-tablet md:px-[39px] lg:h-hero-desktop lg:flex-row lg:items-stretch lg:px-0"
    >""")
rep('src/components/home/HeroSection.tsx',
"""        <div className="flex min-h-0 flex-1 flex-col md:h-hero-slider-tablet md:min-h-hero-slider-tablet md:flex-none lg:block lg:h-hero-slider-desktop lg:min-h-hero-slider-desktop">""",
"""        {/* 194 at 380, not the row's 213: live's slider box runs y161..y355
            and the remaining 19px of the row stay white under it, the same
            shape as the 53px under the strip at 1440. Flex-fill painted the
            slider background over the whole row. */}
        <div className="flex h-hero-slider-mobile min-h-0 flex-none flex-col md:h-hero-slider-tablet md:min-h-hero-slider-tablet lg:block lg:h-hero-slider-desktop lg:min-h-hero-slider-desktop">""")

# 6. tokens.css
rep('src/styles/tokens.css',
"""  --spacing-hero-slider-tablet: 304px;
  --spacing-hero-slider-desktop: 370px;
""",
"""  /* 194 inside the 213 row: refs/ke_live_380.png paints the slider box at
     y161..y355 and leaves the last 19px of the row white (UX01, 14.10). */
  --spacing-hero-slider-mobile: 194px;
  --spacing-hero-slider-tablet: 304px;
  --spacing-hero-slider-desktop: 370px;
""")

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
assert w.count('hero-welcome-') == 7, w.count('hero-welcome-')
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
