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
