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
/**
 * A FIXTURE PAIR, NOT THE PRODUCTION REGISTRY.
 *
 * This used to read `[...ANIMATED_WEBP_SOURCES][0]` and throw if it was empty.
 * On 2026-09-04 both registries were emptied on purpose: their one entry was
 * Electro's iPhone-and-AirPods animation, deleted with the rest of the
 * template's photography, and the test went from testing the swap to failing on
 * its absence.
 *
 * The component takes both paths as props, so the behaviour under test does not
 * need a registered file -- and testing it through a fixture means it keeps
 * working the day a real animated photograph is registered. The registries being
 * empty is itself asserted below, so neither fact goes unrecorded.
 */
const animated = '/images/hero/slider/__fixture-animated.webp'
const still = '/images/hero/slider/__fixture-still.webp'

describe('ArtDirectedHeroImage server markup', () => {
  const html = renderToStaticMarkup(
    <ArtDirectedHeroImage animated={animated} still={still} priority />,
  )

  it('ships no animated source before the client swap', () => {
    expect(html).not.toContain('<source')
    expect(html).not.toContain('animation-steps')
  })

  it('registers no animated source, which is the current content decision', () => {
    // Emptied on 2026-09-04 with the Electro photography. The mechanism above
    // is kept and tested; what is gone is the file it was carrying.
    expect(ANIMATED_WEBP_SOURCES.size).toBe(0)
    expect(Object.keys(HERO_STILL_FRAMES)).toEqual([])
  })

  it('paints the optimized still, eager and high priority', () => {
    // The still travels through /_next/image, so the markup carries its
    // URL-encoded path inside the optimizer URL.
    expect(html).toContain(encodeURIComponent(still))
    expect(html).toMatch(/fetchpriority="high"/i)
    expect(html).toMatch(/loading="eager"/i)
  })
})
