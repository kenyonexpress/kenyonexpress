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
    // pixel diff cannot see it. "קניה חכמה" used to sit second and is last.
    const order = ['לכל חלקי', 'שירות', 'מחירים', 'מותגי יוקרה', 'קניה']
    const positions = order.map((t) => text.indexOf(t))

    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('spells קניה the way the business does', () => {
    // Live writes one yod. It is their wording for their own promise.
    expect(text).toContain('קניה')
    expect(text).not.toContain('קנייה')
  })

  it('renders RTL with five cells', () => {
    expect(html).toContain('dir="rtl"')
    expect((html.match(/<li/g) ?? []).length).toBe(5)
  })

  it('keeps every label on one line', () => {
    // Ten labels, two per cell. Live is 81px tall at 768 and at 1440 alike; a
    // single wrapped label ("מותגי יוקרה" in a 153px cell at 768) took the bar
    // to 94px, which nothing below absorbed, so the deals grid started 17px
    // low and 8000px of identical product cards scored as a band difference.
    expect((html.match(/whitespace-nowrap/g) ?? []).length).toBe(10)
  })
})
