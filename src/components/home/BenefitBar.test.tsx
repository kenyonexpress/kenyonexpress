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

  it('is an 81px bar 30px under the hero, not centred in its strip', () => {
    // Measured UX01 (14.10.2026) on refs/ke_live_{768,1440}.png: 1 + 19 + 47
    // + 13 + 1 = 81 outer at both widths, list top 30px under the hero row.
    const section = html.match(/<section[^>]*>/)?.[0] ?? ''
    expect(section).toContain('md:items-start')
    expect(section).toContain('md:pt-[var(--usp-top)]')
    expect(section).toMatch(/--usp-top:\s*30px/)
    const item = html.match(/<li[^>]*>/)?.[0] ?? ''
    expect(item).toContain('padding-block-start:19px')
    expect(item).toContain('padding-block-end:13px')
    expect((html.match(/line-height:1\.6/g) ?? []).length).toBe(10)
    const wrapper = html.match(/<div class="[^"]*md:w-\[var\(--usp-md-w\)\][^"]*"[^>]*>/)?.[0] ?? ''
    expect(wrapper).toMatch(/--usp-md-w:\s*690px/)
  })

  it('renders RTL with five cells', () => {
    expect(html).toContain('dir="rtl"')
    expect((html.match(/<li/g) ?? []).length).toBe(5)
  })
})
