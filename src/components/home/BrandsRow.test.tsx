import type { BrandTile } from '@/lib/homepage/below-fold-rules'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getHomeBrands = vi.hoisted(() => vi.fn())
vi.mock('@/lib/homepage/below-fold', () => ({ getHomeBrands }))

// next/image needs the Next runtime config to resolve a src; the markup under
// test is the section's, so the optimizer is a plain <img> here.
vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} data-next-image />
  ),
}))

import BrandsRow from './BrandsRow'

const tile = (id: string, name: string, logoUrl: string | null = null): BrandTile => ({
  id,
  name,
  logoUrl,
  href: `/s/${id}`,
})

beforeEach(() => {
  getHomeBrands.mockReset()
})

/**
 * UX11: the brands row is a heading row (title + the link to /merchants) and
 * a `.brands-row__list` of tiles, each the link to one merchant's storefront,
 * carrying either its logo (alt = the name) or its name as a wordmark. The
 * grey-at-rest / colour-on-hover behaviour and the phone scroll are CSS
 * (globals.css) and are measured by e2e/brands-row.spec.ts.
 */
describe('BrandsRow', () => {
  it('renders nothing when no merchant has a product on sale', async () => {
    getHomeBrands.mockResolvedValue([])
    expect(renderToStaticMarkup(await BrandsRow())).toBe('')
  })

  it('renders the heading row, the directory link and one tile per merchant', async () => {
    getHomeBrands.mockResolvedValue([tile('a', 'ביוטי לאב'), tile('b', 'ספורט מקס')])
    const html = renderToStaticMarkup(await BrandsRow())
    expect(html).toMatch(/<section aria-labelledby="home-brands-title" dir="rtl"/)
    expect(html).toContain('<h2 id="home-brands-title"')
    expect(html).toContain('בתי העסק שלנו')
    expect(html).toMatch(/<a[^>]*href="\/merchants"[^>]*>לכל בתי העסק/)
    expect(html).toMatch(/<ul class="brands-row__list" data-brands-list[^>]*>/)
    expect(html.match(/data-brand-tile="[a-z]"/g)).toEqual([
      'data-brand-tile="a"',
      'data-brand-tile="b"',
    ])
    expect(html).toMatch(/<a class="brands-row__link"[^>]*href="\/s\/a"/)
    expect(html).toMatch(/<a[^>]*href="\/s\/b"/)
  })

  it('sets a merchant without a logo as a wordmark, in the same link', async () => {
    getHomeBrands.mockResolvedValue([tile('a', 'טעמים גורמה')])
    const html = renderToStaticMarkup(await BrandsRow())
    expect(html).toContain('data-brand-kind="wordmark"')
    expect(html).toMatch(
      /<span class="brands-row__wordmark" data-brand-wordmark[^>]*>טעמים גורמה<\/span>/,
    )
    expect(html).not.toContain('<img')
  })

  it('shows a logo through next/image with the merchant name as its alt', async () => {
    getHomeBrands.mockResolvedValue([tile('k', 'קניון אקספרס', '/images/logo.webp')])
    const html = renderToStaticMarkup(await BrandsRow())
    expect(html).toContain('data-brand-kind="logo"')
    expect(html).toMatch(
      /<span class="brands-row__logo" data-brand-logo[^>]*><img[^>]*src="\/images\/logo\.webp"/,
    )
    expect(html).toMatch(/<img[^>]*alt="קניון אקספרס"/)
    expect(html).toMatch(/<img[^>]*class="brands-row__img object-contain"/)
    expect(html).not.toContain('data-brand-wordmark')
    // The name is still on the link for the tooltip and for a reader that skips images.
    expect(html).toMatch(/<a[^>]*title="קניון אקספרס"/)
  })

  it('leans on tokens and the tile classes, not Tailwind grid or arbitrary values', async () => {
    getHomeBrands.mockResolvedValue([tile('a', 'א'), tile('b', 'ב')])
    const html = renderToStaticMarkup(await BrandsRow())
    expect(html).not.toMatch(/grid-cols-|\[\d+px\]|#[0-9a-f]{6}/)
    expect(html).toContain('max-w-deals')
  })
})
