/**
 * What a page FAILED to load while it was being photographed.
 *
 * A parity percentage is only a fidelity score if both sides finished
 * rendering, and the reference does not: it is a snapshot of a host that no
 * longer exists, so every absolute URL left in it now fails. This turns the
 * collected failures into one line that travels with the number, in the console
 * and in the report row.
 *
 * MEASURED 2026-09-08, correcting the note in compare.mjs. That note recorded
 * 96 failed requests for the reference and called them "every one a font". The
 * count was right, the attribution was not: 37 fonts, 57 SCRIPTS, 1 stylesheet,
 * 1 xhr, deterministic over four runs at two widths. The reference therefore
 * runs none of the theme's JavaScript.
 */

/**
 * Failures our own side has on a local origin and does not have in production.
 *
 *   /_vercel/(speed-)?insights/script.js  injected by the platform at the edge,
 *                                         so it 404s locally and exists there
 *   https://localhost...                  our CSP sends
 *                                         `upgrade-insecure-requests`, which
 *                                         upgrades a prefetch to https on an
 *                                         http origin, where nothing answers
 *
 * Separated rather than dropped: five expected failures and six read the same
 * otherwise, and the sixth is the one worth seeing.
 */
export const LOCAL_ONLY = [/\/_vercel\/(speed-)?insights\/script\.js/, /^https:\/\/localhost/]

/**
 * @param {{type: string, url: string}[]} failures
 * @returns {string}
 */
export function loadShortfall(failures) {
  if (failures.length === 0) return 'everything loaded'
  const real = failures.filter(({ url }) => !LOCAL_ONLY.some((rx) => rx.test(url)))
  const expected = failures.length - real.length
  if (real.length === 0) return `${expected} failed to load, all expected on a local origin`

  const counts = {}
  for (const { type } of real) counts[type] = (counts[type] ?? 0) + 1
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, n]) => `${n} ${type}`)
  const tail = expected > 0 ? `, plus ${expected} expected on a local origin` : ''
  return `${real.length} failed to load (${parts.join(', ')})${tail}`
}

/**
 * The caveat OUR side carries when it dropped something that paints or runs.
 *
 * MEASURED 2026-10-21. A 1440 home row read 23.91% with worst bands y1100-1300
 * at 63-67%, and the sentence beside it said "3 resources failed locally
 * (2 scripts, 1 fetch)". The two scripts were a prerendered page's own chunks
 * 404ing out of a warm Turbopack cache (scripts/prerender-chunk-gate.mjs), so
 * the page never hydrated, and the unhydrated page was 1490px wide at a 1440
 * viewport. The same tree, cold-built and hydrated, read 8.08%. Nothing in the
 * layout had moved; the number was a screenshot of a page that had not
 * finished becoming itself, and the ledger row did not say so.
 *
 * Returns '' when our side only dropped the local-origin expected set (or
 * nothing), so the common case adds no words to the row.
 *
 * @param {{type: string, url: string}[]} failures
 * @param {{viewport?: number, scrollWidth?: number}} [geometry]
 * @returns {string}
 */
export function ownSideCaveat(failures, geometry = {}) {
  const real = failures.filter(({ url }) => !LOCAL_ONLY.some((rx) => rx.test(url)))
  const parts = []
  const dropped = {}
  for (const { type } of real) {
    if (type === 'script' || type === 'stylesheet') dropped[type] = (dropped[type] ?? 0) + 1
  }
  const droppedParts = Object.entries(dropped)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, n]) => `${n} ${type}`)
  if (droppedParts.length > 0) {
    // Short on purpose: the ledger cell is 160 characters and a regression
    // note may already be using 85 of them.
    parts.push(`OURS dropped ${droppedParts.join(', ')} (unhydrated, not a fidelity score)`)
  }
  const { viewport, scrollWidth } = geometry
  if (Number.isFinite(viewport) && Number.isFinite(scrollWidth) && scrollWidth > viewport) {
    parts.push(`OURS ${scrollWidth}px wide at ${viewport} (overflow)`)
  }
  return parts.join('; ')
}
