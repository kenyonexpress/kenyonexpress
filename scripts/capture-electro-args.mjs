/**
 * Argument parsing for scripts/capture-electro.mjs, kept apart from the
 * browser so it can be pinned by a test that never launches Chromium.
 *
 *   node scripts/capture-electro.mjs <url> <slug> [--add-to-cart=<id>]
 *
 * `--add-to-cart` exists for the two Electro pages that render nothing worth
 * measuring on a cold visit: WooCommerce sends an empty checkout back to the
 * cart, and an empty cart is a one-line panel. Seeding the demo cart with its
 * own `?add-to-cart=<id>` GET before the real navigation is what makes those
 * captures a reference for a filled cart and a checkout that stayed on
 * /checkout, which is the state scripts/compare.mjs seeds locally.
 */

export const DEFAULT_URL = 'https://electro.madrasthemes.com/'
export const DEFAULT_SLUG = 'electro_home'

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ url: string, slug: string, addToCart: string | null, seedUrl: string | null }}
 */
export function parseCaptureArgs(argv) {
  const positional = []
  let addToCart = null
  for (const arg of argv) {
    if (arg.startsWith('--add-to-cart=')) {
      const value = arg.slice('--add-to-cart='.length).trim()
      // WooCommerce product ids are integers. Anything else here is a typo
      // that would otherwise turn into a silent visit to `/?add-to-cart=`,
      // an empty cart, and a capture that looks like a reference.
      if (!/^[0-9]+$/.test(value)) {
        throw new Error(`--add-to-cart expects a numeric product id, got "${value}"`)
      }
      addToCart = value
      continue
    }
    if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    positional.push(arg)
  }
  const url = positional[0] ?? DEFAULT_URL
  const slug = positional[1] ?? DEFAULT_SLUG
  if (!/^[a-z0-9_-]+$/i.test(slug)) {
    throw new Error(`slug "${slug}" must be [a-z0-9_-]: it names files under refs/`)
  }
  const origin = new URL(url).origin
  const seedUrl = addToCart ? `${origin}/?add-to-cart=${addToCart}&quantity=1` : null
  return { url, slug, addToCart, seedUrl }
}
