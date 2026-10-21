/**
 * The brand as it is DISPLAYED, as opposed to the legal entity it belongs to.
 *
 * `קניון EXPRESS` (Hebrew plus Latin, F42) is what the header, the footer, the
 * document titles, the Open Graph card, the web-app manifest and every piece
 * of page copy call the site. The registered trading name, `קניון אקספרס`, is
 * `LEGAL_ENTITY_NAME` in `lib/legal-entity` and is printed in exactly two
 * places: the seller block of the legal pages and the tax documents. One
 * constant here so a page cannot spell the brand a third way.
 *
 * Mixed-script by design, so anywhere it is rendered without a bidi pass
 * (Satori in `opengraph-image.tsx`) must split it into `BRAND_DISPLAY_PARTS`
 * and lay the two runs out as flex children instead of one string.
 */
export const BRAND_DISPLAY_NAME = 'קניון EXPRESS'

/** The two script runs of the name, in logical (reading) order. */
export const BRAND_DISPLAY_PARTS = ['קניון', 'EXPRESS'] as const

/** `<page title> | קניון EXPRESS`, the document title template. */
export const BRAND_TITLE_TEMPLATE = `%s | ${BRAND_DISPLAY_NAME}`

export const BRAND_TAGLINE = 'קופונים ומבצעים'

export const BRAND_DEFAULT_TITLE = `${BRAND_DISPLAY_NAME} | ${BRAND_TAGLINE}`
