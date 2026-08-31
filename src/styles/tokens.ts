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
 * The site-wide palette. Every colour a component may use lives here, is
 * mirrored into `@theme` in `src/app/globals.css` as `--color-<name>`, and is
 * consumed only through the Tailwind utility that property generates
 * (`bg-brand`, `text-heading`, `border-rule`, ...). No `.tsx` file is allowed
 * to name a hex; `tokens.test.ts` enforces both halves of that rule.
 *
 * Values are grouped by what they mean, not by hue. Where a value was read off
 * the live site rather than taken from the brief the comment says so, because
 * the pixel comparison runs against live and a "corrected" colour would fail it.
 */
export const SITE = {
  /** Brand identity. Yellow is live-verified rgb(254,215,0), not the brief's #FDD700. */
  brand: {
    primary: '#fed700',
    primaryHover: '#fedd26',
    dark: '#1a1a1a',
    accent: '#eaf4f6',
  },
  /** Colours that carry meaning: price, state, links, headings. */
  functional: {
    price: '#dc3545',
    /**
     * Crossed-out original price. Darkened from #9ca3af for WCAG AA: at 2.53:1
     * on white it was the worst text pairing left on the site after the
     * brand-yellow sweep, and it paints the coupon product page's "regular
     * price". #6f6f6f is 5.02.
     */
    priceStrike: '#6f6f6f',
    /** Deals-card price ink. Measured on live; darker than `brand.dark`. */
    dealPrice: '#2d2d2d',
    success: '#5cb85c',
    link: '#0062bd',
    heading: '#333e48',
    /* WCAG AA ([40]): the live green is #44b81b and white text on it is
       2.58:1 -- it fails even the 3:1 large-text floor. Darkened by the
       minimum that clears 4.5:1 in both directions (white on it, and it as
       text on white), hue kept. The one place goal 18 overrides
       match-the-live-site, because here the live site is what is wrong. */
    saleBadge: '#328614',
  },
  /** Neutrals: hairlines, muted text, icon greys. */
  neutral: {
    border: '#dddddd',
    borderAlt: '#e7e7e7',
    /** Section-header rule under a tab strip. */
    rule: '#ededed',
    /* WCAG AA ([40]): #7e7e7e was 4.06:1 on white and #768b9e was 3.53:1, both
       below the 4.5:1 floor for body text. Darkened by the minimum that clears
       it, keeping the hue -- measured, not eyeballed. */
    /**
     * Darkened from the live #767676 for WCAG AA. On white it was already 4.54,
     * a hair over; on the #f5f5f5 panels the product page uses for its terms
     * and its supplier block it is 4.16, and axe reported it as serious there.
     * #6f6f6f is 5.02 and 4.61 respectively, so one value covers both surfaces.
     */
    muted: '#6f6f6f',
    muted2: '#657888',
    icon: '#515151',
    /** Large empty-state glyphs (empty cart, no results). */
    iconEmpty: '#cccccc',
  },
  /**
   * Surfaces. `ink` and `surface` are the admin console's text/paper pair: they
   * are deliberately pure black on pure white rather than the storefront's
   * softer `brand.dark`, because admin tables are dense and read all day.
   */
  surface: {
    page: '#ffffff',
    ink: '#000000',
    /** Row/menu hover tint. */
    hover: '#f5f5f5',
    /** Chart bar + progress track. */
    track: '#f1f2f4',
    /** Footer copyright bar. */
    bottomBar: '#eaeaea',
    /** Inline warning banner (unsaved changes, validation notice). */
    warning: '#fffbe6',
    footer: '#333e48',
  },
  /**
   * Promo tints for the left-rail banner cards. Three near-white washes that
   * only ever appear as that card's background.
   */
  promo: {
    rose: '#fff5f5',
    violet: '#f5f5ff',
    sky: '#f0f7ff',
    /**
     * Banner CTA button. Darkened from #ff6b00 for WCAG AA: the button's label
     * is white, bold and 12px, and white on #ff6b00 is 2.86:1. See the note on
     * --color-promo-flame in globals.css.
     */
    flame: '#c24d00',
  },
  /**
   * WhatsApp's own brand colours, used by the share button and the float.
   * They are a third-party mark, not part of the KenyonExpress palette: they
   * are tokenised so no component repeats them, but they must never be
   * rebranded along with `brand.*`.
   */
  whatsapp: {
    base: '#25d366',
    /**
     * WhatsApp's own DARK teal, not its mid teal. #128c7e is 4.14:1 on white
     * and axe fails it as link text, and this token paints a link label rather
     * than the mark itself, so the logo exemption does not cover it. #075e54 is
     * WhatsApp's own colour too - it was already sitting in `inkHover` - at
     * 7.67:1, so nothing here is a colour this project invented, which is what
     * the note above forbids.
     */
    ink: '#075e54',
    /** A shade of the same teal, so the hover still moves. 12.32:1. */
    inkHover: '#043c36',
  },
  /**
   * Facebook's own brand blue, used by the share button on the product page.
   * Same rule as `whatsapp` above: a third-party mark, tokenised so no
   * component repeats it, and never rebranded along with `brand.*`.
   */
  facebook: {
    /**
     * Facebook's own darker blue, the one their buttons use on hover. #1877f2
     * is 4.23:1 on white and axe fails it as link text; this token paints a
     * link label rather than the mark, so the logo exemption does not cover it.
     * #166fe5 is 4.73 and is still Facebook's colour, not one invented here.
     */
    base: '#166fe5',
  },
} as const

/**
 * Every custom property `globals.css` must declare in its `@theme` block, and
 * the value it must carry. `tokens.test.ts` asserts the stylesheet agrees with
 * this map, so a colour can only be changed here.
 *
 * Semantic aliases (`--color-primary`, `--color-brand`, ...) point at the same
 * value as their source token and are listed so a rename cannot silently leave
 * an alias behind pointing at a stale hex.
 */
export const SITE_CSS_VARS: Record<string, string> = {
  '--color-brand-primary': SITE.brand.primary,
  '--color-brand-primary-hover': SITE.brand.primaryHover,
  '--color-brand-dark': SITE.brand.dark,
  '--color-brand-accent': SITE.brand.accent,

  '--color-price': SITE.functional.price,
  '--color-price-strike': SITE.functional.priceStrike,
  '--color-deal-price': SITE.functional.dealPrice,
  '--color-success': SITE.functional.success,
  '--color-link': SITE.functional.link,
  '--color-heading': SITE.functional.heading,
  '--color-sale-badge': SITE.functional.saleBadge,

  '--color-border': SITE.neutral.border,
  '--color-border-alt': SITE.neutral.borderAlt,
  '--color-rule': SITE.neutral.rule,
  '--color-muted': SITE.neutral.muted,
  '--color-muted-2': SITE.neutral.muted2,
  '--color-icon': SITE.neutral.icon,
  '--color-icon-empty': SITE.neutral.iconEmpty,

  '--color-surface': SITE.surface.page,
  '--color-ink': SITE.surface.ink,
  '--color-surface-hover': SITE.surface.hover,
  '--color-track': SITE.surface.track,
  '--color-bottom-bar': SITE.surface.bottomBar,
  '--color-warning-surface': SITE.surface.warning,
  '--color-footer-bg': SITE.surface.footer,

  '--color-promo-rose': SITE.promo.rose,
  '--color-promo-violet': SITE.promo.violet,
  '--color-promo-sky': SITE.promo.sky,
  '--color-promo-flame': SITE.promo.flame,

  '--color-whatsapp': SITE.whatsapp.base,
  '--color-whatsapp-ink': SITE.whatsapp.ink,
  '--color-whatsapp-ink-hover': SITE.whatsapp.inkHover,
  '--color-facebook': SITE.facebook.base,

  // Semantic + backward-compat aliases.
  '--color-background': SITE.surface.page,
  '--color-foreground': SITE.brand.dark,
  '--color-primary': SITE.brand.primary,
  '--color-primary-foreground': SITE.brand.dark,
  '--color-brand': SITE.brand.primary,
  '--color-brand-secondary': SITE.brand.primary,
  '--color-brand-light': SITE.brand.accent,
  '--color-accent': SITE.brand.accent,
}

/**
 * Non-colour tokens `globals.css` must declare, and the value each carries.
 *
 * Only two kinds of number get in here: a size that MORE THAN ONE component
 * uses (the shared type scale), and a box that was MEASURED off the live site
 * (the header bars, the two off-page container widths, the logo boxes).
 *
 * Ordinary one-off spacing stays a literal in the component that uses it. A
 * 2px flex gap or an 80px textarea minimum is not a measurement and not a
 * scale, and giving it a token name would say something untrue about where it
 * came from. `tokens.test.ts` therefore checks that these values agree with
 * the stylesheet; it does not try to ban every px in every file.
 */
export const SITE_CSS_METRICS: Record<string, string> = {
  '--text-nano': '10px',
  '--text-micro': '11px',
  '--text-section-title': '22px',
  '--text-footer-note': '13px',
  '--text-footer-link': '14px',
  '--text-footer-head': '16px',
  '--text-footer-phone': '20px',
  '--text-pdp-title': '25.004px',
  '--text-pdp-body': '14px',
  '--leading-pdp-title': '32.0051px',
  '--leading-pdp-body': '23.996px',

  '--header-height': '70px',
  '--container-page': '1320px',
  '--container-hero-row': '1170px',
  '--container-footer': '1430px',
  '--container-store-footer': '1200px',
  '--container-deals': '1150px',

  '--spacing-header-topbar': '37.3px',
  '--spacing-header-masthead': '109px',
  '--spacing-logo-h': '40px',
  '--spacing-logo-w': '52px',
  '--spacing-footer-logo-h': '42px',
  '--spacing-footer-logo-w': '160px',
  '--spacing-newsletter-min': '470px',
  '--spacing-newsletter-field': '41px',
  '--spacing-newsletter-bar': '80px',
  '--spacing-deals-top': '30px',
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
    muted: '#657888',
    /** sale price. Measured on live; NOT the #E4002B in the brief. */
    sale: '#dc3545',
    /** discount badge background */
    badge: '#328614',
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
  '--cat-eyebrow-gap': '8px',
  '--cat-footer-gap-top': '10px',
}

/**
 * Product-detail page. Measured on the live single-product template
 * (`https://kenyonexpress.co.il/product/מוצר-לדוגמא/`) at 1440x2600 with
 * `scripts/_pdp-probe.mjs` and `scripts/_pdp-summary-probe.mjs`, and the
 * hairline colours read straight out of `refs/live.png`.
 *
 * The vertical numbers are the load-bearing ones. The rebuilt page had the
 * summary wrapped in a card and the shipping/supplier blocks stacked as two
 * more cards, which pushed the footer 230px below where live puts it; every
 * band from y1400 down was comparing our recommendations grid against live's
 * footer. The measurements below are what put the two pages back on the same
 * vertical grid.
 *
 * Same contract as CATALOG: `product-page.css` declares these on `.pdp` and
 * every rule reads them through var(), with `tokens.test.ts` failing if the
 * two drift apart.
 */
export const PDP = {
  color: {
    /** body and heading text */
    ink: '#333e48',
    /** category eyebrow links */
    muted: '#657888',
    /** secondary actions (the stock line sits where live puts its wishlist) */
    action: '#5d7184',
    /** sale price */
    sale: '#dc3545',
    /**
     * Struck-through original price next to the sale price. Darkened from the
     * live #848484 for WCAG AA: it paints at 21px normal weight, which is below
     * the 24px that would let 3:1 apply, and #848484 on white is 3.74:1. axe
     * reported it as serious on every physical product page. #6f6f6f is 5.02
     * on white and 4.61 on the #f5f5f5 panels it also appears over.
     */
    strike: '#6f6f6f',
    /** hairline under the title block, measured at y353 */
    rule: '#cccfd1',
    /** hairline under the recommendations heading, measured at y938 */
    line: '#dddddd',
    /** add-to-cart pill */
    brand: '#fed700',
    brandHover: '#fedd26',
    /**
     * The full-width buy-now button under it. Darkened from the live #ee6443
     * for WCAG AA: its label is white, bold, 14px, and white on #ee6443 is
     * 3.21:1. This is the primary purchase control on every product page, so
     * it is the last place on the site where an unreadable label is acceptable.
     * #c94b28 carries white at 4.65 and the hover at 5.54.
     */
    buy: '#c94b28',
    buyHover: '#b8401f',
    surface: '#ffffff',
  },
  /** Geometry measured on the live single-product template. */
  metric: {
    container: '1170px',
    /** gallery column: x835..1305 */
    gallery: '470px',
    /** summary column: x135..805 */
    summary: '700px',
    columnGap: '15px',
    /** breadcrumb block y165..249 */
    crumbHeight: '84px',
    eyebrowSize: '11.998px',
    eyebrowLine: '17.2771px',
    titleSize: '25.004px',
    titleLine: '32.0051px',
    metaSize: '13.006px',
    metaLine: '18.0133px',
    bodySize: '14px',
    bodyLine: '23.996px',
    priceSize: '35px',
    priceLine: '45.01px',
    priceDelSize: '21px',
    priceDelLine: '31.5px',
    /** quantity field x665..805, y548..593 */
    qtyWidth: '140px',
    qtyHeight: '41px',
    /** add-to-cart pill x469..661, y545..598 */
    atcWidth: '192px',
    atcHeight: '53px',
    /** buy-now spans the whole summary column, y608..654 */
    buyHeight: '46px',
    /** recommendations heading y888..939 */
    relatedTitleSize: '25.004px',
    relatedTitleLine: '40.0064px',
    /** yellow segment of the rule under it, x1071..1304 */
    relatedRuleWidth: '233px',
    /** heading rule y939 to the first card's own text y993 */
    relatedGap: '54px',
    /** live's summary runs 40px past its tag line, y688..728 */
    summaryTail: '40px',
    /** gap between the last section and the footer, y1362..1442 */
    pageTail: '80px',
    /** the content column between header and footer, y165..1442 */
    contentHeight: '1329px',
  },
} as const

/** The CSS custom-property name each PDP colour maps to in product-page.css. */
export const PDP_CSS_VARS: Record<string, string> = {
  '--pdp-ink': PDP.color.ink,
  '--pdp-muted': PDP.color.muted,
  '--pdp-action': PDP.color.action,
  '--pdp-sale': PDP.color.sale,
  '--pdp-strike': PDP.color.strike,
  '--pdp-rule': PDP.color.rule,
  '--pdp-line': PDP.color.line,
  '--pdp-brand': PDP.color.brand,
  '--pdp-brand-hover': PDP.color.brandHover,
  '--pdp-buy': PDP.color.buy,
  '--pdp-buy-hover': PDP.color.buyHover,
  '--pdp-surface': PDP.color.surface,
}

/** Measured PDP geometry and the custom property each value is exposed through. */
export const PDP_CSS_METRICS: Record<string, string> = {
  '--pdp-container': PDP.metric.container,
  '--pdp-gallery': PDP.metric.gallery,
  '--pdp-summary': PDP.metric.summary,
  '--pdp-column-gap': PDP.metric.columnGap,
  '--pdp-crumb-h': PDP.metric.crumbHeight,
  '--pdp-eyebrow-size': PDP.metric.eyebrowSize,
  '--pdp-eyebrow-line': PDP.metric.eyebrowLine,
  '--pdp-title-size': PDP.metric.titleSize,
  '--pdp-title-line': PDP.metric.titleLine,
  '--pdp-meta-size': PDP.metric.metaSize,
  '--pdp-meta-line': PDP.metric.metaLine,
  '--pdp-body-size': PDP.metric.bodySize,
  '--pdp-body-line': PDP.metric.bodyLine,
  '--pdp-price-size': PDP.metric.priceSize,
  '--pdp-price-line': PDP.metric.priceLine,
  '--pdp-price-del-size': PDP.metric.priceDelSize,
  '--pdp-price-del-line': PDP.metric.priceDelLine,
  '--pdp-qty-w': PDP.metric.qtyWidth,
  '--pdp-qty-h': PDP.metric.qtyHeight,
  '--pdp-atc-w': PDP.metric.atcWidth,
  '--pdp-atc-h': PDP.metric.atcHeight,
  '--pdp-buy-h': PDP.metric.buyHeight,
  '--pdp-related-size': PDP.metric.relatedTitleSize,
  '--pdp-related-line': PDP.metric.relatedTitleLine,
  '--pdp-related-rule': PDP.metric.relatedRuleWidth,
  '--pdp-related-gap': PDP.metric.relatedGap,
  '--pdp-summary-tail': PDP.metric.summaryTail,
  '--pdp-page-tail': PDP.metric.pageTail,
  '--pdp-content-h': PDP.metric.contentHeight,
}
