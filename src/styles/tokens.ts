export const ELECTRO = {
  // primary corrected to the live-verified brand yellow (rgb 254,215,0),
  // not the design-spec #FDD700. dark matches live #333e48. blue is the
  // generic Electro sky-blue and is not part of the live brand (unused).
  colors: { primary: '#fed700', dark: '#333E48', blue: '#B0E0E9' },
  radius: { card: '8px', btn: '4px', elevated: '12px' },
  shadow: { card: '0px 2px 8px rgba(0,0,0,0.08)', hover: '0px 4px 16px rgba(0,0,0,0.12)' },
  transition: { card: 'box-shadow 300ms ease-in-out' },
}

/**
 * Catalog archive tokens: /category/[slug], /products, /search.
 *
 * Every value here was read off the LIVE site with getComputedStyle, not taken
 * from a design spec. Where the two disagree the measured value wins, because
 * the pixel comparison runs against live:
 *
 *   - sale price is #dc3545. The brief says #E4002B. Checked BOTH sources the
 *     brief names: getComputedStyle on the live archive returns #dc3545, and
 *     grepping refs/ke_live_singlefile.html (the file the brief designates as
 *     the source of truth) finds #dc3545 twice and #E4002B zero times. The
 *     brief's red does not exist anywhere in the reference.
 *   - the view switcher is #495057 on live, not the #b6bfc8 we had.
 *
 * `brandHover` (#fedd26) is the one value kept purely on the brief's word: it
 * also appears zero times in the singlefile, but it only drives :hover, which
 * no screenshot captures, so honouring the brief there costs no fidelity.
 *
 * `category-page.css` declares these as custom properties on `.category-page`
 * and every rule in that file reads them through var(). `tokens.test.ts`
 * asserts the two stay in step, so a colour can only be changed here.
 */
export const CATALOG = {
  color: {
    /** body / default archive text */
    ink: '#333e48',
    /** product titles */
    link: '#0062bd',
    /** struck-through original price, category eyebrow */
    muted: '#768b9e',
    /** sale price. Measured on live; NOT the #E4002B in the brief. */
    sale: '#dc3545',
    /** discount badge background */
    badge: '#44b81b',
    /** control bar background */
    bar: '#efefef',
    /** hairlines: select border, card bottom rule, carousel rule */
    line: '#dddddd',
    /** view switcher icons. Measured on live. */
    switcher: '#495057',
    surface: '#ffffff',
    /** brand yellow and its hover, per the brief and the live masthead */
    brand: '#fed700',
    brandHover: '#fedd26',
  },
  /** Geometry measured on the live archive. */
  metric: {
    container: '1170px',
    cardColumn: '234px',
    cardContent: '186px',
    thumbMax: '186.03px',
    controlBarHeight: '45.89px',
    controlBarRadius: '9px',
    selectWidth: '174px',
    selectHeight: '34.3px',
    selectRadius: '20.006px',
    titleSize: '25.004px',
    titleLine: '40.0064px',
    priceSize: '20.006px',
    priceLine: '20.006px',
    priceBox: '27px',
    eyebrowSize: '11.998px',
    eyebrowLine: '12.5979px',
    bodySize: '14px',
    bodyLine: '23.996px',
    productTitleSize: '14px',
    productTitleLine: '18.0001px',
    cardPadTop: '20.006px',
    cardPadInline: '24px',
    cardPadBottom: '14px',
    thumbGap: '25.96px',
    footerHeight: '36px',
    footerGap: '7px',
    atcWidth: '37.14px',
    atcHeight: '33.88px',
    atcRadius: '22px',
    carouselHeadHeight: '45px',
    carouselHeadGap: '16.996px',
    carouselTitleSize: '21.994px',
    carouselTitleLine: '35.2px',
    carouselTitlePad: '8.7976px',
  },
} as const

/** The CSS custom-property name each colour maps to in category-page.css. */
export const CATALOG_CSS_VARS: Record<string, string> = {
  '--cat-ink': CATALOG.color.ink,
  '--cat-link': CATALOG.color.link,
  '--cat-muted': CATALOG.color.muted,
  '--cat-sale': CATALOG.color.sale,
  '--cat-badge': CATALOG.color.badge,
  '--cat-bar': CATALOG.color.bar,
  '--cat-line': CATALOG.color.line,
  '--cat-switcher': CATALOG.color.switcher,
  '--cat-surface': CATALOG.color.surface,
  '--cat-brand': CATALOG.color.brand,
  '--cat-brand-hover': CATALOG.color.brandHover,
}

/**
 * Geometry measured off the live archive, and the custom property each value
 * is exposed through. Only DISTINCTIVE measurements are tokenised: ordinary
 * CSS spacing (1px hairlines, 4px and 8px radii) is not a measurement and stays
 * literal, because tokenising it would say something untrue about where it came
 * from.
 *
 * Several measurements share a number (25.004px is both the archive title size
 * and the breadcrumb top padding). They keep separate names for readability;
 * the stylesheet may use either, since the rendered result is identical.
 */
export const CATALOG_CSS_METRICS: Record<string, string> = {
  '--cat-container': CATALOG.metric.container,
  '--cat-card-col': CATALOG.metric.cardColumn,
  '--cat-thumb-max': CATALOG.metric.thumbMax,
  '--cat-body-line': CATALOG.metric.bodyLine,
  '--cat-title-size': CATALOG.metric.titleSize,
  '--cat-title-line': CATALOG.metric.titleLine,
  '--cat-price-size': CATALOG.metric.priceSize,
  '--cat-price-del-size': '12.0036px',
  '--cat-eyebrow-size': CATALOG.metric.eyebrowSize,
  '--cat-eyebrow-line': CATALOG.metric.eyebrowLine,
  '--cat-ptitle-line': CATALOG.metric.productTitleLine,
  '--cat-bar-height': CATALOG.metric.controlBarHeight,
  '--cat-bar-pad-y': '2.8px',
  '--cat-select-w': CATALOG.metric.selectWidth,
  '--cat-select-h': CATALOG.metric.selectHeight,
  '--cat-select-pad-y': '4.16px',
  '--cat-crumb-pad-top': '25.004px',
  '--cat-crumb-pad-bot': '22.4px',
  '--cat-thumb-gap': CATALOG.metric.thumbGap,
  '--cat-atc-w': CATALOG.metric.atcWidth,
  '--cat-atc-h': CATALOG.metric.atcHeight,
  '--cat-carousel-gap': CATALOG.metric.carouselHeadGap,
  '--cat-carousel-size': CATALOG.metric.carouselTitleSize,
  '--cat-carousel-line': CATALOG.metric.carouselTitleLine,
  '--cat-carousel-pad': CATALOG.metric.carouselTitlePad,
}
