import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CitiesRow from './CitiesRow'

/**
 * The strip under the hero slider replaces live's product-categories-list and
 * must keep its cell geometry: probed in the live archive on 2026-10-20,
 * li.category is 146px wide at 768 (five across the 729px column) exactly as
 * at 1440. Two 384px cells at 768 were part of the 41.82% home/768 run.
 */
describe('CitiesRow', () => {
  const html = renderToStaticMarkup(<CitiesRow />)

  it('switches to five cells at md, not lg', () => {
    const li = html.match(/<li[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(li).toContain('md:w-[20%]')
    expect(li).toContain('md:flex-[0_0_20%]')
    expect(li).not.toContain('lg:w-[20%]')
  })

  it("keeps the strip at live's 170px", () => {
    expect(html).toContain('height:170px')
  })
})
