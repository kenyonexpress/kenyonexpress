import { CartProvider } from '@/components/cart/CartProvider'
import { DealsOfTheDayFallback } from '@/components/home/DealsOfTheDay'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * Q48 (2026-10-01): the Suspense fallback used to render every card
 * `loading="lazy"`, on the theory that the real catalogue grid always
 * replaces it before the browser paints. Lighthouse mobile measured the
 * opposite under throttling - the fallback's own first card became the LCP
 * candidate, still lazy, with 1061ms of avoidable resource load delay. The
 * fallback must carry the same one-card priority hint as the real grid.
 */
const render = (element: ReactElement) =>
  renderToStaticMarkup(<CartProvider>{element}</CartProvider>)

describe('DealsOfTheDayFallback', () => {
  // `renderToStaticMarkup` outside a compiled Next app never emits
  // `fetchpriority` for a plain `next/image` `<Image priority>` (unlike the
  // hand-built `<img>` in `ArtDirectedHeroImage`, which sets it directly) -
  // the real attribute is confirmed against a built server in the Q48 state
  // note. `loading="lazy"` being absent is what this harness can see, and it
  // is exactly the attribute the regression reintroduced.
  it('gives the first card the LCP priority hint, not loading=lazy', () => {
    const html = render(<DealsOfTheDayFallback />)
    const firstImage = html.match(/<img[^>]*class="p_con__image"[^>]*>/)?.[0] ?? ''
    expect(firstImage).not.toBe('')
    expect(firstImage).not.toContain('loading="lazy"')
  })

  it('keeps every card after the first one lazy', () => {
    const html = render(<DealsOfTheDayFallback />)
    const images = html.match(/<img[^>]*class="p_con__image"[^>]*>/g) ?? []
    expect(images.length).toBeGreaterThan(1)
    for (const img of images.slice(1)) {
      expect(img).toContain('loading="lazy"')
    }
  })
})
