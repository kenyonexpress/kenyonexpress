import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import HeroCategorySidebar from './HeroCategorySidebar'

/**
 * The departments list starts 7px under the yellow bar, the way live's does.
 * Measured UX01 (14.10.2026) on refs/ke_live_1440.png: the bar ends at y196
 * on both sides, live's first row rule is at y237 and ours was at y230, and
 * the 35px row pitch below it matched -- so the whole list drift was that one
 * gap. A pixel gate reads it as every row being 7px off.
 */
describe('HeroCategorySidebar', () => {
  const html = renderToStaticMarkup(<HeroCategorySidebar />)

  it('opens the list 7px under the yellow bar and closes it 5px under the last row', () => {
    const ul = html.match(/<ul[^>]*>/)?.[0] ?? ''
    expect(ul).toContain('padding-top:7px')
    expect(ul).toContain('padding-bottom:5px')
  })

  it('hangs a 270px list over the slider edge from a 241px column', () => {
    // Live's departments dropdown is wider than its title box; the extra 29px
    // lie over the slider (white, y196..y593 at 1440). The aside must not
    // clip it and must not stretch to the row.
    const aside = html.match(/<aside[^>]*>/)?.[0] ?? ''
    const ul = html.match(/<ul[^>]*>/)?.[0] ?? ''
    expect(aside).toContain('width:241px')
    expect(aside).not.toContain('overflow-hidden')
    expect(aside).not.toContain('h-full')
    expect(aside).toContain('self-start')
    expect(ul).toContain('width:270px')
    expect(ul).toContain('margin-inline-end:-29px')
    expect(ul).toContain('bg-white')
  })

  it('keeps the 34.66px row: 6.5px padding around a 14px/1.5 line', () => {
    const link = html.match(/<a[^>]*href="\/category\/[^"]*"[^>]*>/)?.[0] ?? ''
    expect(link).toContain('padding:6.5px 5px 6.5px 0')
    expect(link).toContain('font-size:14px')
    expect(link).toContain('line-height:1.5')
  })
})
