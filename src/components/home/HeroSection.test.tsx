import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/home/HeroSlider', () => ({
  default: () => <div data-hero-slider="" />,
}))
vi.mock('@/components/home/HeroPromoBanners', () => ({ default: () => null }))
vi.mock('@/components/store/CategoryStrip', () => ({ default: () => null }))

import HeroSection from './HeroSection'

/**
 * Hero row geometry below lg, measured UX01 (14.10.2026) against
 * refs/ke_live_380.png and refs/ke_live_768.png. Live keeps its Bootstrap
 * container on a phone and a tablet, so the slider box is inset 15px at 380
 * (x15..x365) and 39px at 768 (x39..x728); ours bled edge to edge. At 380 the
 * slider box is also 194px tall inside the 213px row, with the last 19px
 * white -- flex-fill painted the slider background over all 213.
 */
describe('HeroSection', () => {
  const html = renderToStaticMarkup(<HeroSection />)
  const section = html.match(/<section[^>]*>/)?.[0] ?? ''

  it('keeps the page gutter below lg and drops it at lg', () => {
    expect(section).toContain('px-gutter')
    expect(section).toContain('md:px-hero-gutter-tablet')
    expect(section).toContain('lg:px-0')
  })

  it('draws no rule under the row', () => {
    expect(section).not.toContain('border-b')
  })

  it('lets the centre column run the desktop 728 at md, hung from the left edge', () => {
    const column = html.match(/<div class="[^"]*md:w-hero-center-tablet[^"]*"/)?.[0] ?? ''
    expect(column).toContain('md:self-end')
    expect(column).toContain('lg:w-auto')
  })

  it('holds the slider at its measured 194px on a phone', () => {
    const wrapper = html.match(/<div class="[^"]*h-hero-slider-mobile[^"]*"/)?.[0] ?? ''
    expect(wrapper).toContain('flex-none')
    expect(wrapper).toContain('md:h-hero-slider-tablet')
    expect(wrapper).not.toContain('flex-1')
  })
})
