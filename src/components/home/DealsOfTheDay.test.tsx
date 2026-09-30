import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DealsOfTheDay from './DealsOfTheDay'

// The island needs the cart provider; the grid's image hints do not.
vi.mock('@/components/cart/AddToCartButton', () => ({ default: () => null }))

/**
 * THE PHONE'S LCP IMAGE IS EAGER AND HIGH PRIORITY, AND ONLY THAT ONE.
 *
 * At phone widths the hero paints no photograph, so the first deal card's
 * image is the largest raster in the first viewport. Measured 30.09.2026
 * (Lighthouse mobile, devtools throttling): as a lazy image it could not be
 * requested until layout, 1783ms after the first byte, and LCP was 3.2s.
 * The fix is one `priority` on one card. This pins both halves: the first
 * card is eager with `fetchpriority="high"`, and the other 31 stay lazy, so
 * nobody "helps" by marking the whole first row and hands the phone three
 * offscreen rasters competing with the one that matters.
 */
describe('DealsOfTheDay image loading hints', () => {
  it('marks exactly the first card image as the priority (LCP) image', async () => {
    const html = renderToStaticMarkup(await DealsOfTheDay())
    const imgs = html.match(/<img[^>]*class="p_con__image"[^>]*>/g) ?? []
    expect(imgs.length).toBeGreaterThanOrEqual(30)

    const [first, ...rest] = imgs
    expect(first).toMatch(/fetchpriority="high"/i)
    expect(first).not.toMatch(/loading="lazy"/)

    for (const img of rest) {
      expect(img).toMatch(/loading="lazy"/)
      expect(img).not.toMatch(/fetchpriority="high"/i)
    }
  })

  it('keeps width and height on every card image so the grid reserves its rows', async () => {
    const html = renderToStaticMarkup(await DealsOfTheDay())
    const imgs = html.match(/<img[^>]*class="p_con__image"[^>]*>/g) ?? []
    for (const img of imgs) {
      expect(img).toMatch(/ width="\d+"/)
      expect(img).toMatch(/ height="\d+"/)
    }
  })
})
