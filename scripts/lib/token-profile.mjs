// Turns a page's computed-style dump into something two DIFFERENT DOMs can be
// compared on.
//
// WHY NOT ELEMENT BY ELEMENT
//
// refs/ke_live_computed.json is a WooCommerce theme: `div.hfeed.site`,
// `rs-module`, `.p_con__image-wrap`. Our rebuild shares none of those class
// names and does not share the nesting either -- home is 1832 live boxes
// against a completely different tree. Pairing element N with element N is
// therefore not a measurement, it is an alignment artefact, and any percentage
// it produces would move whenever either side added a wrapper div.
//
// What DOES survive the rebuild is the design: which type sizes, weights,
// families, text colours, fills and corner radii cover how much of the page.
// That is what this profiles. Every recorded box contributes its own area to
// the value it carries, the areas are normalised to fractions, and two pages
// are scored by total variation distance between those distributions:
//
//     TVD = 0.5 * SUM over values of |fraction_live - fraction_mine|
//
// 0% means the two pages spend their pixels on exactly the same tokens in
// exactly the same proportions; 100% means they share none.
//
// KNOWN LIMIT, stated rather than hidden: nested boxes double-count, so a tree
// with more wrapper divs inflates whatever the wrappers inherit. Both sides are
// walked by the same function (scripts/lib/computed.mjs) so the bias is in the
// same direction, but this is a proxy for "does it look like the reference",
// not a pixel count. The pixel count is diff-bands.mjs, and that stays the gate.

/** The properties whose distribution says something about the design. */
export const PROFILED_PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-radius',
]

/**
 * Font stacks come back quoted inconsistently (`"Open Sans"` live,
 * `__Heebo_xxxxx, Heebo` from next/font locally) and the trailing fallbacks
 * carry no design intent, so only the first family is kept and it is unquoted.
 *
 * Lengths are rounded to a tenth of a pixel, and that is not cosmetic. The
 * first run of this comparison scored line-height at 99.89% different on the
 * homepage, and the whole of it was `23.996px` against `24px`: a unitless 1.714
 * line-height on a 14px body against a flat 24px. Four thousandths of a pixel
 * cannot be seen, cannot be fixed, and was drowning the properties that had
 * something to say. Anything a designer would call the same number is now the
 * same value.
 *
 * Everything else is compared verbatim: both sides are read by the same
 * Chromium, so colours and keywords already serialise identically.
 */
export function normalizeValue(prop, raw) {
  const value = (raw ?? '').trim()
  if (!value) return '(unset)'
  if (prop === 'font-family') {
    return value
      .split(',')[0]
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase()
  }
  // Multi-value lengths (`border-radius: 4px 4px 0px 0px`) round per token.
  return value.replace(/-?\d+\.\d+px/g, (px) => `${Math.round(Number.parseFloat(px) * 10) / 10}px`)
}

/**
 * @param {Array<{tag?:string,x:number,y:number,w:number,h:number,style:Record<string,string>}>} elements
 * @returns {{count:number, totalArea:number, pageHeight:number, contentEnd:number|null, dist:Record<string, Map<string, number>>}}
 *   `dist` values are fractions of total area, summing to 1 per property.
 */
export function profilePage(elements) {
  const areaByValue = Object.fromEntries(PROFILED_PROPS.map((p) => [p, new Map()]))
  let totalArea = 0
  let pageHeight = 0
  // Where the page stops being the page and starts being chrome. `footer` is
  // the one landmark both sides genuinely share -- the live theme calls it
  // footer.site-footer and ours footer.w-full, so the TAG is the only part that
  // survives the rebuild, and that is enough.
  //
  // Worth its own line because page height hides the thing it answers. On
  // /search the two pages are 2780px and 2696px tall, which reads as agreement,
  // while live's content runs to y=1795 and ours has handed over to the footer
  // at y=799: 3 results against 17. Two pages with that little in common do not
  // produce a fidelity score, they produce a number.
  let contentEnd = null

  for (const el of elements) {
    // The page is as tall as its lowest box reaches. Taken from the elements
    // rather than from the root, because the root of a WooCommerce page is not
    // always the tallest thing on it.
    pageHeight = Math.max(pageHeight, el.y + el.h)
    if (el.tag === 'footer') contentEnd = contentEnd === null ? el.y : Math.min(contentEnd, el.y)

    const area = el.w * el.h
    if (area <= 0) continue
    totalArea += area
    for (const prop of PROFILED_PROPS) {
      const value = normalizeValue(prop, el.style?.[prop])
      areaByValue[prop].set(value, (areaByValue[prop].get(value) ?? 0) + area)
    }
  }

  const dist = {}
  for (const prop of PROFILED_PROPS) {
    const fractions = new Map()
    for (const [value, area] of areaByValue[prop]) {
      fractions.set(value, totalArea > 0 ? area / totalArea : 0)
    }
    dist[prop] = fractions
  }

  return { count: elements.length, totalArea, pageHeight, contentEnd, dist }
}

/**
 * Total variation distance between two profiles, per property and overall,
 * with the values that contribute most to each gap named so the output points
 * at something fixable instead of just scoring it.
 *
 * @returns {{overallPct:number, props:Array<{prop:string, pct:number, worst:Array<{value:string, live:number, mine:number, gap:number}>}>}}
 */
export function compareProfiles(live, mine, { worstPerProp = 3 } = {}) {
  const props = PROFILED_PROPS.map((prop) => {
    const values = new Set([...live.dist[prop].keys(), ...mine.dist[prop].keys()])
    let sum = 0
    const gaps = []
    for (const value of values) {
      const a = live.dist[prop].get(value) ?? 0
      const b = mine.dist[prop].get(value) ?? 0
      sum += Math.abs(a - b)
      gaps.push({ value, live: a, mine: b, gap: Math.abs(a - b) })
    }
    gaps.sort((x, y) => y.gap - x.gap)
    return {
      prop,
      pct: +(50 * sum).toFixed(2),
      worst: gaps.slice(0, worstPerProp),
    }
  })

  const overallPct = +(props.reduce((acc, p) => acc + p.pct, 0) / props.length).toFixed(2)
  return { overallPct, props }
}
