import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CitiesRow from './CitiesRow'

/**
 * C137: the strip under the hero slider no longer renders city cards
 * (decision 15.10.2026). It keeps the 170px slot and shows the Apple and Tesla
 * products banners with real images.
 */
describe('hero strip (formerly CitiesRow)', () => {
  const html = renderToStaticMarkup(<CitiesRow />)

  it('renders no city cards and no /c/<city> links', () => {
    expect(html).not.toMatch(/aria-label="ערים"/)
    expect(html).not.toMatch(/city-[a-z-]+\.svg/)
  })

  it('renders exactly the Apple and Tesla banners', () => {
    expect(html.match(/data-hero-banner="/g) ?? []).toHaveLength(2)
    expect(html).toContain('data-hero-banner="apple"')
    expect(html).toContain('data-hero-banner="tesla"')
    expect(html).toContain('apple-logo.webp')
    expect(html).toContain('tesla-logo.webp')
  })

  it("keeps the strip at live's 170px", () => {
    expect(html).toContain('h-hero-strip')
  })
})
