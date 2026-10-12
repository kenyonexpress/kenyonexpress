// THE DEFAULT REFERENCE OF THE PARITY GATE, IN ONE PLACE.
//
// Until 13.10.2026 compare.mjs had no default reference that could produce a
// number: every LIVE_* constant names kenyonexpress.co.il, which serves this
// project's own build since the DNS cutover, so a bare run refused with exit 5
// (docs/PARITY-REFERENCE.md). `--baseline=` existed, but every caller had to
// know which file to pass, and the files were named three different ways.
//
// The owner's decision (KEN-8) is that the reference is the Electro template,
// frozen as PNG captures: Electro gives the shape, the live site gave the
// content (docs/SOURCING-RULES.md), and the live site is gone.
//
// `{width}` is expanded by compare.mjs to the viewport of the run.
//
// cart and checkout have no entry ON PURPOSE. No capture of Electro's cart or
// checkout with a seeded line exists in refs/, and a default that pointed at a
// file nobody made would turn "there is no reference" into "frozen capture not
// found", which reads like an operator error.
export const ELECTRO_V7_URL = 'https://electro.madrasthemes.com/home-v7/'
export const ELECTRO_V7_SLUG = 'electro_v7'
export const BASELINE_WIDTHS = [380, 768, 1440]

export const DEFAULT_BASELINES = Object.freeze({
  home: `refs/${ELECTRO_V7_SLUG}_{width}.png`,
  product: 'refs/electro_product_{width}.png',
  category: 'refs/electro_shop_{width}.png',
  products: 'refs/electro_shop_{width}.png',
})

/**
 * The frozen capture a run falls back to, or null when the caller named a
 * reference itself or the page has none.
 *
 * `--live=<url>` wins over the default: someone who points the gate at a URL
 * is asking for a live navigation, and silently swapping a PNG in would score
 * a different thing than the one they named.
 *
 * @param {string} page
 * @param {{ live?: string | null, livePng?: string | null }} [explicit]
 * @returns {string | null}
 */
export function defaultBaselineFor(page, explicit = {}) {
  if (explicit.livePng) return explicit.livePng
  if (explicit.live) return null
  return DEFAULT_BASELINES[page] ?? null
}

/** The command that regenerates a missing default capture, or null. */
export function recaptureHint(path) {
  return path.includes(`${ELECTRO_V7_SLUG}_`) ? 'node scripts/capture-electro-baseline.mjs' : null
}
