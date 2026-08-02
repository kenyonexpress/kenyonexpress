import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ANIMATED_WEBP_SOURCES, ArtDirectedHeroImage, HERO_STILL_FRAMES } from './HeroSlider'

/**
 * The animated hero file must not exist in server markup. [22](ד) measured the
 * cost of it being there: with the `<source>` (and its head preload) in the
 * initial HTML, the desktop's first hero paint waited for all 794404 bytes and
 * the homepage's desktop LCP was 12.1-12.9s on slow 4G + cpu/4. The animation
 * is now a client-side upgrade - fetched at low priority after `window` load,
 * mounted only when fully downloaded - so the server markup has to carry the
 * optimized still and nothing else.
 *
 * Rendered with renderToStaticMarkup because that IS the claim being tested:
 * what the server sends before any effect runs. A browser-level test cannot
 * see this state on localhost, where hydration and the swap land inside the
 * first second; the E2E swap test holds the file on the wire instead.
 */
const animated = [...ANIMATED_WEBP_SOURCES][0]
if (!animated) throw new Error('no animated hero source registered')
const still = HERO_STILL_FRAMES[animated]
if (!still) throw new Error(`no still frame registered for ${animated}`)

describe('ArtDirectedHeroImage server markup', () => {
  const html = renderToStaticMarkup(
    <ArtDirectedHeroImage animated={animated} still={still} priority />,
  )

  it('ships no animated source before the client swap', () => {
    expect(html).not.toContain('<source')
    expect(html).not.toContain('animation-steps')
  })

  it('paints the optimized still, eager and high priority', () => {
    // The still travels through /_next/image, so the markup carries its
    // URL-encoded path inside the optimizer URL.
    expect(html).toContain(encodeURIComponent(still))
    expect(html).toMatch(/fetchpriority="high"/i)
    expect(html).toMatch(/loading="eager"/i)
  })
})
