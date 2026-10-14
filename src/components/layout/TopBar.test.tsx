import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TopBar from './TopBar'

/**
 * COMPONENT 01 OF THE QUEUE, held to what was measured off live.
 *
 * The bar had been built once already and looked right in a screenshot while
 * being wrong in two ways a screenshot cannot show:
 *
 *   1. THE ORDER WAS MIRRORED. `INFO_ITEMS` listed התחברות first. In an RTL
 *      flex row the first child renders RIGHTMOST, so the account entry point
 *      sat on the right while live's is hard against the inline-end on the
 *      left. A comment above the array called that "live's RTL order", which is
 *      exactly the sort of claim that survives review and fails measurement.
 *
 *   2. THE SEPARATOR WAS THE WRONG SIZE. Live draws a `|` glyph with 1em of
 *      margin on each side, ~33px; this drew a 12px flex gap and a hairline
 *      box, and hid it below `md` where live shows it. 21px per gap, three
 *      gaps, and a different wrap point at 380.
 *
 * Both are DOM-order and class facts, which is why they can be asserted here
 * rather than in Playwright. What the rendered geometry does is measured by
 * `scripts/compare.mjs` and recorded in docs/COMPONENT-QUEUE.md.
 */
describe('TopBar, component 01', () => {
  const html = renderToStaticMarkup(<TopBar />)
  const text = html.replace(/<[^>]+>/g, '')

  it('carries live’s four info items and the home-only greeting', () => {
    for (const label of [
      'בפריסה ארצית',
      'משלוח מהיר חינם',
      'קניה בטוחה',
      'התחברות',
      'ברוך הבא לעולם של קניון Express',
    ]) {
      expect(text).toContain(label)
    }
  })

  it('puts the account entry point LAST in the DOM, which in RTL is the left', () => {
    // The order live's `ul#menu-top-bar-right` declares. Asserted as positions
    // rather than as a snapshot so the failure names the item that moved.
    const order = ['בפריסה ארצית', 'משלוח מהיר חינם', 'קניה בטוחה', 'התחברות']
    const at = order.map((label) => text.indexOf(label))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect(
      at,
      'DOM-first is rightmost in RTL: התחברות must be last so it lands on the left',
    ).toEqual([...at].sort((a, b) => a - b))
  })

  it('makes the account item the only link in the bar', () => {
    // Live marks the other three `disable-link` with href="#": they are labels,
    // not destinations. And the standing rule is one account entry point in the
    // whole shell, so a second <a> here would be a second one to find.
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
    expect(hrefs).toEqual(['/login'])
  })

  it('separates the items with live’s `|` glyph at 1em, not a hairline box', () => {
    const separators = [...html.matchAll(/mx-\[1em\][^"]*"[^>]*>\|</g)]
    expect(separators, 'one separator between each pair of the four items').toHaveLength(3)
    // The old mark. `w-px` + a `md:` gate is the shape that was measured wrong.
    expect(html).not.toMatch(/w-px/)
    expect(html).not.toMatch(/md:block/)
  })

  it('holds the separator to a token colour rather than a literal #ddd', () => {
    expect(html).toContain('text-border')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('leaves the greeting hidden by default, for `:has()` to reveal on home', () => {
    // Gated in CSS on purpose: reading the pathname here turns every
    // prerendered route dynamic. TopBar.tsx records that trap in full.
    expect(html).toMatch(/class="topbar-greeting hidden[^"]*"/)
  })

  it('hovers the account link to live’s darker heading colour, not an opacity fade', () => {
    // Live: `a:hover{color:#29323a}` on text and icon together. `opacity-70`
    // greyed both instead, and a phone could hold it after a tap.
    const link = html.match(/<a [^>]*href="\/login"[^>]*>/)?.[0] ?? ''
    expect(link).toContain('hover:text-heading-hover')
    expect(link).toContain('transition-colors')
    expect(link).not.toMatch(/opacity/)
  })

  it('pins the type to the 13.006px token rather than an em off the body', () => {
    // .929em is live's rule, off live's 14px body. Off our 16px body it is
    // 14.864px, every item 14% wide, and 414 wraps 2+2 where live wraps 3+1.
    expect(html).toContain('text-topbar')
    expect(html).not.toMatch(/text-\[0?\.929em\]/)
  })

  it('sits in Bootstrap’s responsive container, not the page container', () => {
    // 100% / 540 / 720 / 960 / 1200: at 768 the items start at x39, and the
    // masthead under them, full width on live, at x15. `max-w-page` had both
    // at x15.
    const row = html.match(/<div class="topbar-container[^"]*"/)?.[0] ?? ''
    expect(row, 'the container class is on the row').not.toBe('')
    expect(row).toContain('px-gutter')
    expect(row).not.toContain('max-w-page')
  })

  it('spends no flex gap on top of the separators', () => {
    // A `gap-x-*` on the row would double-count live's 1em margins, which is
    // how the bar ends up 63px wide of live at 1440 while looking fine.
    const row = html.match(/<div class="flex flex-wrap items-center[^"]*"/)?.[0] ?? ''
    expect(row).not.toMatch(/gap-x-/)
  })
})
