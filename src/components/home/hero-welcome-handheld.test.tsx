import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/analytics/use-experiment-variant', () => ({
  useExperimentVariant: () => 'control',
}))

import HeroSlider, { type HeroSlide } from './HeroSlider'

const WELCOME: HeroSlide = {
  id: 'welcome',
  variant: 'welcome',
  title: 'ברוכים הבאים',
  title_secondary: 'לקניון Express',
  tagline: 'מסדרים לך בילוי . . .',
  promo_small: 'פשוט',
  promo_large: 'הכי טוב',
  image_url: null,
  link_url: null,
}

/**
 * The welcome copy's phone layout lives in src/styles/home-handheld.css and
 * reaches the markup through class hooks and one custom property. This pins
 * both ends: every hook the stylesheet targets is on the element it expects,
 * and the padding-top is a custom property the media query can override --
 * an inline `padding-top` cannot be, which is how the promo price ended up
 * under the dots on every phone (UX01, 14.10.2026).
 */
describe('welcome slide handheld hooks', () => {
  const html = renderToStaticMarkup(<HeroSlider slides={[WELCOME]} />)
  const css = readFileSync(resolve(process.cwd(), 'src/styles/home-handheld.css'), 'utf8')

  it('hands the desktop padding-top over as a custom property', () => {
    const column = html.match(/<div class="[^"]*hero-welcome-copy[^"]*"[^>]*>/)?.[0] ?? ''
    expect(column).toContain('pt-[var(--hero-copy-pt,var(--hero-copy-pt-lg))]')
    expect(column).toMatch(/--hero-copy-pt-lg:\s*47px/)
    // The phone value is NOT set inline: an inline custom property would beat
    // the stylesheet's media query on the same element.
    expect(column).not.toMatch(/--hero-copy-pt:/)
    expect(column).not.toContain('padding-top:')
  })

  it('carries every hook the phone stylesheet targets', () => {
    const hooks = [...css.matchAll(/\.(hero-welcome-[a-z0-9-]+)\.\1/g)].map((m) => m[1])
    expect(hooks.length).toBeGreaterThanOrEqual(7)
    for (const hook of hooks) expect(html, hook).toContain(hook)
  })

  it('shrinks the stack only below 768px', () => {
    const block = css.slice(css.indexOf('.hero-welcome-copy'))
    const media = css
      .slice(0, css.indexOf('.hero-welcome-copy'))
      .match(/@media \(max-width: 767px\)/g)
    expect(media?.length).toBe(1)
    expect(block).toContain('--hero-copy-pt: 12px')
  })
})
