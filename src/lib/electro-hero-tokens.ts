/**
 * Hero layout tokens measured from electro home-v7 @ 1440px.
 * Source: refs/electro-tokens.json → hero
 */
export const ELECTRO_HERO = {
  slider: {
    // 370, remeasured off refs/ke_live_computed.json 2026-09-02 (was 377 from
    // the electro demo, which is a different site).
    height: 370,
    width: 743,
    /** RevSlider slide bg (ke_live + electro home-v7) */
    bg: '#eef7f9',
    /** rs-layer image — desktop @ 831px module, scaled to 743px */
    image: {
      width: 370,
      height: 495,
      offsetTop: 21,
      /** xo:364 on 831px → ~49% trailing half */
      widthPercent: 49.8,
    },
    /** Text block — xo:31px, measured tops relative to slide */
    text: {
      paddingStart: 31,
      paddingTop: 47,
      line2Top: 100,
      taglineTop: 157,
      priceLabelTop: 187,
      priceTop: 205,
      maxWidthPercent: 50,
    },
  },
  categoryColumn: {
    /* 241, not 220. Measured on kenyonexpress.co.il 2026-07-30: the hero row is
       1170 wide and the slider inside it is 728, so the two fixed side columns
       account for 442. The left promo column measures 201, leaving 241 here. The
       old 220 came from the electro home-v7 demo, which is a different site; the
       21px it was short went to the slider through flex-1. */
    width: 241,
    // 593: the live hero columns all run y148..y741 (refs, 2026-09-02).
    height: 593,
    textColor: '#333e48',
    /* THE LIST IS WIDER THAN THE COLUMN. Measured UX01 (14.10.2026) on
       refs/ke_live_1440.png: the yellow title box is x1064..x1304 (the 241
       above, confirmed at a threshold that excludes the slider's tint), but
       the row rules run x1049..x1290 and the white behind them starts at
       x1035 -- Electro's departments dropdown is 270 wide, hung from the
       column's inline start, and its extra 29px lie OVER the slider's right
       edge (the tint stops at x1034 from y196 to y593, and the strip's last
       tile border at x1063 shows again below y593). So the list carries its
       own width, a negative inline-end margin, a white background and a
       z-index, and the aside no longer clips or stretches. */
    listWidth: 270,
    /* Bootstrap's `.dropdown-menu{padding:5px 0}` plus the 1px border it
       keeps and we zero: 7 above the first row (rule y237, not y230), 5 under
       the last (list bottom y593). */
    listPaddingTop: 7,
    listPaddingBottom: 5,
  },
  sideBanners: {
    /* 201 measured on live; see the note on categoryColumn.width above. */
    width: 201,
    // Live: three 197px da-blocks fill the 593px column (refs, 2026-09-02).
    blockHeight: 593,
    itemHeight: 197,
    itemWidth: 168,
    offsetTop: 36,
    shopButtonSize: 26,
    shopButtonColor: '#fed700',
  },
  dots: {
    activeWidth: 30,
    activeHeight: 8,
    inactiveSize: 8,
    color: '#fed700',
    borderRadius: 3,
    bottomOffset: 6,
  },
  typography: {
    // 51/45, remeasured off refs/ke_live_computed.json 2026-09-02: the live
    // headline layers are "Open Sans" 51px and 45px. 58/51 came from the
    // electro demo. (The FONT stays Heebo by standing project rule; the size
    // is the half of the delta that is ours to close.)
    headline1: { desktop: 51, mobile: 43, weight: 300, color: '#333e48' },
    headline2: { desktop: 45, mobile: 38, weight: 300, letterSpacing: '-0.01em', color: '#333e48' },
    /** RevSlider layer-4 tagline (live site: 19px bold) */
    tagline: { desktop: 19, mobile: 11, weight: 700, color: '#333e48' },
    /** RevSlider "FROM" label */
    priceLabel: { desktop: 13, mobile: 12, weight: 400, color: '#333e48' },
    /** RevSlider price amount layer (~45–50px bold) */
    price: { desktop: 45, mobile: 35, weight: 700, color: '#333e48' },
    description: { desktop: 13, mobile: 12, color: '#333e48' },
    bannerText: { size: 11, lineHeight: 13, color: '#333e48' },
    categoryLink: { size: 14, color: '#333e48' },
  },
  grid: {
    /** Physical LTR: [side banners | slider | categories] */
    columns: '200px minmax(0,1fr) 225px',
    rowHeight: 512,
  },
  /**
   * USP / benefit bar (the icons-with-text strip below the hero).
   * Values match the electro home-v7 / ke_live build (compare.mjs band ~6.6%).
   * REMEASURED UX01 (14.10.2026) against refs/ke_live_{768,1440}.png: the live
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
    /* The bar is not centred in its 134px strip: live's list starts 30px under
       the hero row at both 768 (y613 = 88 + 495 + 30) and 1440 (y791 = 148 +
       613 + 30), and the remaining 23 stay white below it. Centring the
       81px list put it 3px high at both widths. */
    topMargin: 30,
    icon: {
      size: 36,
      color: '#fed700',
      strokeWidth: 1.5,
    },
    title: { size: 15, weight: 700, color: '#333e48' },
    subtitle: { size: 13, weight: 400, color: '#767676', marginBlockStart: 2 },
  },
  /**
   * Top categories row (below the hero, above the USP bar). Matches ke_live /
   * electro home-v7: a 5-up strip right-offset inside the page container
   * (x577-1305 @ 1440px), not page-centred. RTL order: first item renders
   * at the inline-start (visual right).
   */
  categoryStrip: {
    height: 170,
    borderColor: '#e7e7e7',
    offsetInlineEnd: 517,
    maxWidth: 728,
    itemPaddingInline: 12,
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
    label: { size: 14, weight: 600, color: '#333e48' },
    hoverShadow: '0 0 18px -2px rgba(0,0,0,0.2)',
  },
} as const
