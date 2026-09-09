/**
 * IS THE PAGE ON THE LEFT ACTUALLY THE REFERENCE?
 *
 * `scripts/compare.mjs` scores our build against the site it was rebuilt from,
 * and every `LIVE_*` constant in it names a URL on `kenyonexpress.co.il`. That
 * host stopped being the reference. DNS was cut over to Vercel, and the domain
 * now serves THIS project's Next build.
 *
 * Measured 2026-09-09, `https://kenyonexpress.co.il/cart/` followed to
 * `https://www.kenyonexpress.co.il/cart`, HTTP 200:
 *
 *   woocommerce markers   0
 *   `_next` references  125
 *   <title>               סל הקניות | קניון אקספרס   (ours)
 *
 * So the gate CLAUDE.md makes mandatory for every visual step is now capable of
 * photographing our build twice and reporting the difference as fidelity. That
 * is the same defect the rest of compare.mjs already refuses in five other
 * shapes -- the not-found page, the 404 category, the empty cart against a
 * seeded one, two different catalogues, a moving hero -- and it is the worst of
 * them, because self-comparison fails SAFE: it produces a small number, and a
 * small number reads as a pass.
 *
 * This module is the classifier, kept pure and separate from the browser so it
 * can be tested without one. `compare.mjs` reads the markers off the live page
 * and hands them here; the refusal text lives here too, so that the message and
 * the rule cannot drift apart.
 *
 * WHY THE MARKERS ARE STYLESHEETS AND SCRIPTS, NEVER IMAGES. Our own catalogue
 * still serves product photos from the old WordPress media paths, so
 * `img[src*="wp-content"]` is present on OUR pages and would classify our build
 * as the reference -- the exact failure this module exists to catch, wearing a
 * green tick. A WooCommerce page cannot render without loading wp-content CSS
 * and JS, and our build never loads either, so those are the honest signals.
 */

/** The live side is the WooCommerce site the rebuild was measured against. */
export const REFERENCE = 'woocommerce'
/** The live side is this project's own build. Comparing it to ours is a mirror. */
export const OUR_BUILD = 'our-build'
/** Neither marker set is present. Unrecognised is not the same as wrong, and both refuse. */
export const UNKNOWN = 'unknown'

/**
 * @typedef {object} ReferenceMarkers
 * @property {number} wpStyleOrScript  <link rel=stylesheet> / <script> whose URL is wp-content or wp-includes.
 * @property {boolean} wooBodyClass    body carries a woocommerce/wordpress class.
 * @property {string|null} generator   <meta name="generator"> content, if any.
 * @property {number} nextAssets       <script>/<link> whose URL is under /_next/.
 * @property {boolean} nextRuntime     A Next runtime element is in the document.
 */

/**
 * @param {ReferenceMarkers} m
 * @returns {{kind: string, why: string}}
 */
export function classifyReference(m) {
  const generator = m.generator ?? ''
  const wordpress =
    m.wpStyleOrScript > 0 || m.wooBodyClass === true || /wordpress|woocommerce/i.test(generator)
  const ours = m.nextAssets > 0 || m.nextRuntime === true

  // Both at once is not a tie to be broken, it is a page nobody has described.
  // Guessing here would put a number on a comparison whose left side is not
  // known, which is the thing being prevented.
  if (wordpress && ours) {
    return {
      kind: UNKNOWN,
      why: `carries both WordPress markers (${m.wpStyleOrScript} wp-content/wp-includes asset(s), body class ${m.wooBodyClass}) and Next markers (${m.nextAssets} /_next/ asset(s), runtime ${m.nextRuntime})`,
    }
  }
  if (wordpress) {
    return {
      kind: REFERENCE,
      why: `${m.wpStyleOrScript} wp-content/wp-includes stylesheet or script reference(s)${m.wooBodyClass ? ', woocommerce body class' : ''}${generator ? `, generator "${generator}"` : ''}`,
    }
  }
  if (ours) {
    return {
      kind: OUR_BUILD,
      why: `${m.nextAssets} /_next/ asset reference(s)${m.nextRuntime ? ' and a Next runtime element' : ''}, and no wp-content stylesheet or script at all`,
    }
  }
  return {
    kind: UNKNOWN,
    why: 'no WordPress and no Next markers were found in the document',
  }
}

/**
 * @param {{url: string, kind: string, why: string}} found
 * @returns {string}
 */
export function refusalMessage({ url, kind, why }) {
  const head = `REFUSING to measure: ${url} is not the reference.`
  if (kind === OUR_BUILD) {
    return [
      head,
      `  It is this project's own build (${why}).`,
      '  kenyonexpress.co.il points at our Vercel deployment now, so scoring against it',
      '  compares our build with our build. That is not a low parity number, it is no',
      '  measurement at all -- and unlike the other failures here, it fails SAFE and',
      '  would have been recorded as a pass.',
      '  See docs/PARITY-REFERENCE.md for what a reference has to be before this gate',
      '  can produce a number again.',
    ].join('\n')
  }
  return [
    head,
    `  ${why}.`,
    '  compare.mjs scores our build against the WooCommerce site it was rebuilt from.',
    '  A page it cannot identify as that site is not a left-hand side.',
  ].join('\n')
}
