/**
 * Hero layout tokens measured from electro home-v7 @ 1440px.
 * Source: refs/electro-tokens.json → hero
 */
export const ELECTRO_HERO = {
  slider: {
    height: 377,
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
    width: 220,
    height: 512,
    textColor: '#333e48',
  },
  sideBanners: {
    width: 200,
    blockHeight: 512,
    itemHeight: 99,
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
} as const
