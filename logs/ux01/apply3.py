# -*- coding: utf-8 -*-
import io
def rep(path, old, new, count=1):
    s = io.open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == count, (path, old[:70], n)
    io.open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print('ok', path)

# tokens
rep('src/lib/electro-hero-tokens.ts',
"""    width: 241,
    // 593: the live hero columns all run y148..y741 (refs, 2026-09-02).
    height: 593,
    textColor: '#333e48',
  },""",
"""    /* 270, not 241, and it is the capture the gate scores against that says
       so (UX01, 14.10.2026, refs/ke_live_1440.png): the yellow title box runs
       x1035..x1304, the row rules x1049..x1290 (1em of 14px in from each
       side), and the slider's background stops at x1034. The 241 above was
       arithmetic on a different capture. The 29px the column grew come out of
       the slider; the category strip under it keeps its 728 and runs UNDER
       this column, which is why the aside carries its own white background
       and a z-index and ends with its list (y593) instead of filling the row:
       below y593 live shows the strip's last tile border at x1063. */
    width: 270,
    // 593: the live hero columns all run y148..y741 (refs, 2026-09-02).
    height: 593,
    textColor: '#333e48',
    /* Bootstrap's `.dropdown-menu{padding:5px 0}` plus the 1px border it
       keeps and we zero: 7 above the first row, 5 under the last (measured
       UX01: list bottom y593 = 552 rule + 41 last row... 587 + 5). */
    listPaddingTop: 7,
    listPaddingBottom: 5,
  },""")
rep('src/lib/electro-hero-tokens.ts',
"""    paddingBlockStart: 19,
    paddingBlockEnd: 13,
    lineHeight: 1.6,
""",
"""    paddingBlockStart: 19,
    paddingBlockEnd: 13,
    lineHeight: 1.6,
    /* The bar is not centred in its 134px strip: live's list starts 30px under
       the hero row at both 768 (y613 = 88 + 495 + 30) and 1440 (y791 = 148 +
       613 + 30), and the remaining 23 stay white below it. Centring the
       81px list put it 3px high at both widths. */
    topMargin: 30,
""")
rep('src/lib/electro-hero-tokens.ts',
"""    itemPaddingInline: 12,
    itemPaddingTop: 16,
    image: { size: 100, marginBottom: 10, fallbackIconSize: 28 },
""",
"""    itemPaddingInline: 12,
    /* 28 / 80 / 7, re-solved UX01 (14.10.2026) against refs/ke_live_{768,1440}.png.
       The photo (100 wide, 70-71 tall under object-contain) sits with its
       centre 68px under the strip's top rule at both widths, and the label's
       glyphs start 115px under it; with the old 16 / 100 / 10 ours painted the
       photo 2px high and the label 11px low on every tile. Any (padding, box
       height, margin) with padding + height/2 = 68 and padding + height +
       margin = 115 renders these photos identically; 80 is the box that keeps
       the 100 width and a sane margin. */
    itemPaddingTop: 28,
    image: { size: 100, height: 80, marginBottom: 7, fallbackIconSize: 28 },
    /* The text-only tile ("עד ₪99") centres its label 4.5px above the strip's
       mid-line on live (y598.5 against a 518..688 strip at 1440; the same at
       768): a 9px bottom inset reproduces it. */
    labelOnlyPaddingBottom: 9,
""")

# sidebar
rep('src/components/home/HeroCategorySidebar.tsx',
"""      className="home-vertical-nav departments-menu-v2 hidden h-full shrink-0 flex-col overflow-hidden bg-white font-sans lg:flex"
    >
      <div className="dropdown show-dropdown flex h-full min-h-0 flex-col">""",
"""      // self-start, z-10 and NOT h-full: the column is as tall as its list and
      // sits over the category strip's last 29px (see categoryColumn.width in
      // electro-hero-tokens.ts). Stretched to the row it covered the strip's
      // tile border live shows below y593.
      className="home-vertical-nav departments-menu-v2 relative z-10 hidden shrink-0 self-start flex-col overflow-hidden bg-white font-sans lg:flex"
    >
      <div className="dropdown show-dropdown flex min-h-0 flex-col">""")
rep('src/components/home/HeroCategorySidebar.tsx',
"""            style={{ borderWidth: 0, borderRadius: 0, paddingTop: 7 }}""",
"""            style={{
              borderWidth: 0,
              borderRadius: 0,
              paddingTop: CC.listPaddingTop,
              paddingBottom: CC.listPaddingBottom,
            }}""")

# hero section
rep('src/components/home/HeroSection.tsx',
"""      className="mx-auto flex h-hero-mobile w-full max-w-hero-row flex-col border-b border-border px-gutter font-sans md:h-hero-tablet md:px-[39px] lg:h-hero-desktop lg:flex-row lg:items-stretch lg:px-0"
    >""",
"""      // No border-b: live draws no rule under the hero row at any of the
      // three widths (columns x400-410 at 1440, x45-60 at 768, x20-30 at 380
      // all read white between the row and the feature bar).
      className="mx-auto flex h-hero-mobile w-full max-w-hero-row flex-col px-gutter font-sans md:h-hero-tablet md:px-[39px] lg:h-hero-desktop lg:flex-row lg:items-stretch lg:px-0"
    >""")
rep('src/components/home/HeroSection.tsx',
"""      <div className="flex min-h-0 min-w-0 flex-1 flex-col">""",
"""      {/* md:w-[728px] md:self-end: at 768 live's slider and strip are the
          desktop 728 wide, anchored at the container's LEFT edge (x39) and
          running to x767 -- past the 690px container, which is a horizontal
          overflow on live that we do not reproduce (the row still fits the
          768 viewport exactly, so nothing scrolls). self-end is the left
          edge in this dir="rtl" column. Measured UX01, 14.10.2026. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:w-[728px] md:self-end lg:w-auto lg:self-auto">""")

# strip
rep('src/components/store/CategoryStrip.tsx',
"""            inHero
              ? 'm-0 flex w-full list-none flex-nowrap p-0'
              :""",
"""            inHero
              ? // lg:w-[728px] lg:-ms-[29px]: the strip keeps live's 728 under a
                // 699px slider column, overflowing 29px at its inline start (the
                // right, dir="rtl") beneath the category sidebar, which paints
                // white over it down to its own list bottom. See
                // categoryColumn.width in electro-hero-tokens.ts.
                'm-0 flex w-full list-none flex-nowrap p-0 lg:-ms-[29px] lg:w-[728px]'
              :""")
rep('src/components/store/CategoryStrip.tsx',
"""                style={{
                  paddingInline: C.itemPaddingInline,
                  paddingTop: cat.image ? C.itemPaddingTop : undefined,
                }}""",
"""                style={{
                  paddingInline: C.itemPaddingInline,
                  paddingTop: cat.image ? C.itemPaddingTop : undefined,
                  paddingBottom: cat.image ? undefined : C.labelOnlyPaddingBottom,
                }}""")
rep('src/components/store/CategoryStrip.tsx',
"""                    style={{
                      width: C.image.size,
                      height: C.image.size,
                      marginBottom: C.image.marginBottom,
                    }}""",
"""                    style={{
                      width: C.image.size,
                      height: C.image.height,
                      marginBottom: C.image.marginBottom,
                    }}""")

# benefit bar
rep('src/components/home/BenefitBar.tsx',
"""    <section
      dir="rtl"
      className="h-feature-bar-mobile w-full bg-white font-sans md:flex md:h-feature-bar md:items-center"
    >""",
"""    <section
      dir="rtl"
      // items-start + a 30px top inset, not items-center: see USP.topMargin.
      className="h-feature-bar-mobile w-full bg-white font-sans md:flex md:h-feature-bar md:items-start md:pt-[var(--usp-top)]"
      style={{ '--usp-top': `${USP.topMargin}px` } as React.CSSProperties}
    >""")

# hero copy: the phone override must win over the desktop value
rep('src/components/home/HeroSlider.tsx',
"""      className={`${RS.copyColumn} hero-welcome-copy w-full pb-12 pt-[var(--hero-copy-pt)] lg:w-1/2`}
      style={{ '--hero-copy-pt': `${SLIDE.text.paddingTop}px` } as React.CSSProperties}""",
"""      className={`${RS.copyColumn} hero-welcome-copy w-full pb-12 pt-[var(--hero-copy-pt,var(--hero-copy-pt-lg))] lg:w-1/2`}
      // Two properties, because an inline custom property beats any class
      // rule on the same element: the desktop value is the FALLBACK, and the
      // phone stylesheet sets --hero-copy-pt itself (measured UX01: with one
      // property the 47px inline value won on every phone and the promo
      // price stayed under the dots).
      style={{ '--hero-copy-pt-lg': `${SLIDE.text.paddingTop}px` } as React.CSSProperties}""")
rep('src/components/home/HeroSlider.tsx',
"""    // The padding-top rides a custom property rather than an inline value so
    // src/styles/home-handheld.css can shrink it below 768px: an inline style
    // cannot be overridden by a media query. The hero-welcome-* classes are
    // hooks for the same stylesheet; above 1024px none of them do anything.
""",
"""    // The padding-top rides custom properties rather than an inline value so
    // src/styles/home-handheld.css can shrink it below 768px: an inline style
    // cannot be overridden by a media query. The hero-welcome-* classes are
    // hooks for the same stylesheet; above 1024px none of them do anything.
""")
rep('src/components/home/hero-welcome-handheld.test.tsx',
"""    expect(column).toContain('pt-[var(--hero-copy-pt)]')
    expect(column).toMatch(/--hero-copy-pt:\\s*47px/)""",
"""    expect(column).toContain('pt-[var(--hero-copy-pt,var(--hero-copy-pt-lg))]')
    expect(column).toMatch(/--hero-copy-pt-lg:\\s*47px/)
    // The phone value is NOT set inline: an inline custom property would beat
    // the stylesheet's media query on the same element.
    expect(column).not.toMatch(/--hero-copy-pt:/)""")

# card css
rep('src/styles/product-card-deals.css',
"""  line-height: 26px;
}
""",
"""  line-height: 26px;
}

/* Below the desktop grid live pitches the same title at 1.3 (28.6px: rows
   y1034 -> y1062 at 380, y796 -> y825 at 768), and 1.2 from 1200 up. */
@media (max-width: 1199px) {
  .p_con__title,
  .jet-listing-grid-deals h2.p_con__title {
    line-height: 1.3;
  }
}
""")
rep('src/styles/product-card-deals.css',
"""/* Live's price row is 27px tall on a phone (y872 h27); ours came out at 24,
   which left the card 2px short and drifted 8px by the fourth row. */
.p_con__footer .p_con__prices {
  min-height: 27px;
}""",
"""/* Live's price row is 27px tall on a phone (y872 h27); ours came out at 24,
   which left the card 2px short and drifted 8px by the fourth row. The line
   height is pinned too: the 16px sale price inherits the body's 1.8 and made
   the row 29, which put the cart button 2px low on every phone card (UX01). */
.p_con__footer .p_con__prices {
  min-height: 27px;
  line-height: 27px;
}""")
rep('src/styles/product-card-deals.css',
"""  align-items: center;
  gap: 8px;
  text-align: end;
}""",
"""  align-items: center;
  gap: 8px;
  /* start, not end: both prices flex-grow, so on a phone each owns half the
     282px row, and `end` pushed the strike to the row's middle and the sale
     price to the far left. Live (y1399 at 380) keeps the strike at the right
     edge and the sale price at the start of its half. From 768 up the row is
     only as wide as its text and the value is moot. */
  text-align: start;
}""")
