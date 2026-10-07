import nextDefaultLoader from 'next/dist/shared/lib/image-loader'
import { afterEach, describe, expect, it, vi } from 'vitest'
import r2ImageLoader from './loader'
import { resolveImageSrc } from './r2-paths'

/**
 * The config next/image resolves from next.config.ts and hands to the loader.
 * `qualities` matches the real one so the closest-quality snap is exercised
 * against the same ladder production uses.
 */
const config = { path: '/_next/image', qualities: [50, 60, 75, 90, 95] }

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('r2ImageLoader is byte-equal to Next’s default loader for everything it leaves alone', () => {
  const sources = [
    '/images/hero/category/e-baby-d2.webp',
    '/images/logo.webp',
    'https://images.unsplash.com/photo-1?auto=format',
    'https://abc.supabase.co/storage/v1/object/public/x/y.webp',
    '/images/products/a.webp', // the flag is off here, so this passes through too
  ]

  it.each(sources)('%s', (src) => {
    vi.stubEnv('NEXT_PUBLIC_R2_IMAGES', '')
    for (const width of [16, 288, 384, 1080, 3840]) {
      for (const quality of [undefined, 50, 55, 75, 100]) {
        const expected = nextDefaultLoader({ config, src, width, quality } as never)
        expect(r2ImageLoader({ config, src, width, quality })).toBe(expected)
      }
    }
  })

  it('snaps an unlisted quality to the nearest rung, like the default', () => {
    vi.stubEnv('NEXT_PUBLIC_R2_IMAGES', '')
    expect(r2ImageLoader({ config, src: '/a.webp', width: 288, quality: 57 })).toBe(
      '/_next/image?url=%2Fa.webp&w=288&q=60',
    )
    expect(r2ImageLoader({ src: '/a.webp', width: 288 })).toBe(
      '/_next/image?url=%2Fa.webp&w=288&q=75',
    )
  })
})

describe('with NEXT_PUBLIC_R2_IMAGES=1', () => {
  it('sends stored product and cdn paths through the signed proxy, and nothing else', () => {
    vi.stubEnv('NEXT_PUBLIC_R2_IMAGES', '1')
    expect(
      r2ImageLoader({ config, src: '/images/products/b7.avif', width: 384, quality: 60 }),
    ).toBe('/_next/image?url=%2Fimages%2Fr2%2Fproducts%2Fb7.avif&w=384&q=60')
    expect(r2ImageLoader({ config, src: '/images/cdn/wp/ab/abc.card.webp', width: 288 })).toBe(
      '/_next/image?url=%2Fimages%2Fr2%2Fwp%2Fab%2Fabc.card.webp&w=288&q=75',
    )
    // The hero and category tiles live under public/ and stay there.
    expect(r2ImageLoader({ config, src: '/images/hero/x.webp', width: 288 })).toBe(
      '/_next/image?url=%2Fimages%2Fhero%2Fx.webp&w=288&q=75',
    )
  })
})

describe('resolveImageSrc', () => {
  it('is the identity until the flag is "1" exactly', () => {
    for (const flag of [undefined, '', '0', 'true', 'yes']) {
      expect(resolveImageSrc('/images/products/a.webp', flag === '1')).toBe(
        '/images/products/a.webp',
      )
    }
    expect(resolveImageSrc('/images/products/a.webp', true)).toBe('/images/r2/products/a.webp')
    expect(resolveImageSrc('/images/cdn/wp/aa/h.webp', true)).toBe('/images/r2/wp/aa/h.webp')
    expect(resolveImageSrc('https://cdn.kenyonexpress.co.il/products/a.webp', true)).toBe(
      'https://cdn.kenyonexpress.co.il/products/a.webp',
    )
  })
})
