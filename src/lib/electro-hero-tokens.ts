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
    headline1: { desktop: 58, mobile: 43, weight: 300, color: '#333e48' },
    headline2: { desktop: 51, mobile: 38, weight: 300, letterSpacing: '-0.01em', color: '#333e48' },
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
   * paddingBlock kept as em (relative to the 16px row font-size) to reproduce
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
    itemPaddingTop: 16,
    image: { size: 100, marginBottom: 10, fallbackIconSize: 28 },
    label: { size: 14, weight: 600, color: '#333e48' },
    hoverShadow: '0 0 18px -2px rgba(0,0,0,0.2)',
  },
} as const
