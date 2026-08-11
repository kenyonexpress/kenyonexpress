// The computed-style walker, shared by the two scripts that must agree on it.
//
// snapshot-live.mjs runs it against the live site to build
// refs/ke_live_computed.json, and compare.mjs runs the SAME function against
// the local page. If each kept its own copy, the two sides of every comparison
// would be measuring slightly different things and the difference would be
// reported as a fidelity score. That is the whole reason this file exists.

/**
 * The properties worth recording.
 *
 * Deliberately NOT the whole CSSStyleDeclaration: that is ~340 longhand
 * properties per element, which across seven pages is a JSON nobody can diff.
 * These are the ones a layout is rebuilt from.
 */
export const PROPS = [
  'width',
  'height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-radius',
]

/**
 * Runs in the page. Walks every element and records the properties above.
 *
 * Elements with no box (display:none, and the head's script/meta/style nodes)
 * are skipped: they have computed styles but no geometry, and keeping them
 * triples the file for rows that can never be compared against a rendered
 * layout.
 *
 * Passed to page.evaluate as a function value, so it must not close over
 * anything in this module -- `props` is an argument for that reason.
 */
export function collectComputed(props) {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    const cs = getComputedStyle(el)
    const style = {}
    for (const prop of props) style[prop] = cs.getPropertyValue(prop)

    out.push({
      tag: el.tagName.toLowerCase(),
      // `className` is not a string on SVG elements (it is an SVGAnimatedString),
      // which is why this reads the attribute instead.
      class: el.getAttribute('class') ?? '',
      id: el.id || undefined,
      // Rounded: sub-pixel noise differs between runs on the same page and would
      // make every snapshot diff against the last one for no reason.
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      style,
    })
  }
  return out
}
