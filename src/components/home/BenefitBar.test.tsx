import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BenefitBar from './BenefitBar'

/**
 * The trust band is a 1:1 copy of the live site's Electro `features-list`.
 * These assertions are the live strings and the live ORDER, transcribed from
 * https://kenyonexpress.co.il on 2026-08-10. `refs/ke_live_singlefile.html`,
 * which the goal names, does not exist in this repo; compare.mjs already
 * defaults the home reference to the live site for the same reason.
 */
describe('BenefitBar', () => {
  const html = renderToStaticMarkup(<BenefitBar />)
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('carries the five live pairs', () => {
    for (const [title, subtitle] of [
      ['לכל חלקי', 'הארץ'],
      ['שירות', 'לקוחות'],
      ['מחירים', 'מנצחים'],
      ['מותגי יוקרה', 'מובילים !'],
      ['קניה', 'חכמה'],
    ]) {
      expect(text).toContain(title)
      expect(text).toContain(subtitle)
    }
  })

  it('keeps the live order', () => {
    // Five items in five equal fifths: one out of place moves every label
    // after it into the wrong cell, and the band stays exactly as wide, so a
    // pixel diff cannot see it. Re-measured 2026-09-02 off
    // refs/ke_live_computed.json: the live icon order right-to-left is
    // transport, customers, support, payment, tag -- "קניה חכמה" is SECOND
    // today. An earlier capture had it last; the reference moved.
    const order = ['לכל חלקי', 'קניה', 'שירות', 'מחירים', 'מותגי יוקרה']
    const positions = order.map((t) => text.indexOf(t))

    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('spells קניה the way the business does', () => {
    // Live writes one yod. It is their wording for their own promise.
    expect(text).toContain('קניה')
    expect(text).not.toContain('קנייה')
  })

  it('lays the five cells in one clipped row from md, as live does at 768', () => {
    // Probed in the live archive 2026-10-20 at 768: .features-list x39 w690
    // holds five 180px .feature cells right-to-left and clips the fifth.
    // Ours wrapped sm:w-1/2 into three rows and spilled under the 134px band.
    const ul = html.match(/<ul[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(ul).toContain('flex-nowrap')
    expect(ul).toContain('overflow-hidden')
    expect(ul).not.toContain('flex-wrap')
    const li = html.match(/<li[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(li).toContain('w-usp-cell-tablet')
    expect(li).toContain('lg:w-1/5')
    expect(li).not.toContain('sm:w-1/2')
    // The list box: live's 690 at 768, the 1170 token from lg.
    expect(html).toContain('md:max-w-usp-tablet')
    expect(html).toContain('--usp-max:1170px')
  })

  it("sits 30px into the band at live's 81.4px list height", () => {
    // Live's items are at y619 / y798 (768 / 1440); centring a 71px list in
    // the 134px band put ours at y615 / y794.
    const section = html.match(/<section[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(section).toContain('md:pt-usp-offset')
    expect(section).not.toContain('items-center')
    const ul = html.match(/<ul[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(ul).toContain('min-h-usp-list')
    expect(ul).toContain('items-center')
  })

  it('renders RTL with five cells', () => {
    expect(html).toContain('dir="rtl"')
    expect((html.match(/<li/g) ?? []).length).toBe(5)
  })
})
