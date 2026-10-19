import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IMAGE_QUALITIES,
  RESPONSIVE_BREAKPOINTS,
  artDirectedSources,
  cfImageUrl,
  isR2Enabled,
  responsiveSrcSet,
} from './optimizer'

describe('Image Optimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cfImageUrl', () => {
    it('generates Cloudflare Image Resizing URL for absolute paths', () => {
      const url = cfImageUrl('/products/sku123.jpg', 400, 'webp', 75)
      expect(url).toContain('/images/r2/cdn-cgi/image/')
      expect(url).toContain('width=400')
      expect(url).toContain('quality=75')
      expect(url).toContain('format=webp')
      expect(url).toContain('/products/sku123.jpg')
    })

    it('generates AVIF format URL by default', () => {
      const url = cfImageUrl('/test.jpg', 300)
      expect(url).toContain('format=avif')
    })

    it('includes fit=scale-down for responsive sizing', () => {
      const url = cfImageUrl('/test.jpg', 500)
      expect(url).toContain('fit=scale-down')
    })

    it('handles different quality levels', () => {
      const qualities = [50, 60, 75, 90, 95]
      for (const q of qualities) {
        const url = cfImageUrl('/test.jpg', 300, 'jpeg', q as 50 | 60 | 75 | 90 | 95)
        expect(url).toContain(`quality=${q}`)
      }
    })

    it('supports all image formats', () => {
      const formats: Array<'avif' | 'webp' | 'jpeg'> = ['avif', 'webp', 'jpeg']
      for (const fmt of formats) {
        const url = cfImageUrl('/test.jpg', 300, fmt)
        expect(url).toContain(`format=${fmt}`)
      }
    })

    it('handles full URLs by extracting pathname', () => {
      const url = cfImageUrl('https://example.com/products/test.jpg', 300, 'webp')
      expect(url).toContain('/products/test.jpg')
      expect(url).not.toContain('https://example.com')
    })
  })

  describe('responsiveSrcSet', () => {
    it('generates srcset with multiple widths', () => {
      const srcset = responsiveSrcSet('/test.jpg', [256, 384, 600])
      expect(srcset).toContain('256w')
      expect(srcset).toContain('384w')
      expect(srcset).toContain('600w')
    })

    it('deduplicates widths', () => {
      const srcset = responsiveSrcSet('/test.jpg', [256, 256, 384, 384])
      const widths = srcset.match(/\d+w/g)
      expect(widths).toHaveLength(2)
    })

    it('sorts widths in ascending order', () => {
      const srcset = responsiveSrcSet('/test.jpg', [600, 256, 384])
      const match = srcset.match(/(\d+)w/g) || []
      const parsed = match.map((w) => Number.parseInt(w))
      expect(parsed).toEqual([256, 384, 600])
    })

    it('uses AVIF format by default', () => {
      const srcset = responsiveSrcSet('/test.jpg', [256])
      expect(srcset).toContain('format=avif')
    })

    it('generates valid srcset format', () => {
      const srcset = responsiveSrcSet('/test.jpg', [256, 384, 600])
      const entries = srcset.split(',').map((s) => s.trim())
      expect(entries.length).toBe(3)
      for (const entry of entries) {
        expect(entry).toMatch(/^.+\s\d+w$/)
      }
    })
  })

  describe('artDirectedSources', () => {
    it('provides sources for mobile/tablet/desktop', () => {
      const sources = artDirectedSources('/test.jpg')
      expect(sources).toHaveProperty('mobile')
      expect(sources).toHaveProperty('tablet')
      expect(sources).toHaveProperty('desktop')
    })

    it('mobile source has correct media query', () => {
      const sources = artDirectedSources('/test.jpg')
      expect(sources.mobile.media).toBe('(max-width: 639px)')
    })

    it('tablet source has correct media query', () => {
      const sources = artDirectedSources('/test.jpg')
      expect(sources.tablet.media).toContain('640px')
      expect(sources.tablet.media).toContain('1024px')
    })

    it('desktop source has correct media query', () => {
      const sources = artDirectedSources('/test.jpg')
      expect(sources.desktop.media).toBe('(min-width: 1024px)')
    })

    it('each source has valid srcset', () => {
      const sources = artDirectedSources('/test.jpg')
      for (const source of Object.values(sources)) {
        expect(source.srcSet).toContain('1x')
        expect(source.srcSet).toContain('2x')
      }
    })

    it('uses AVIF format for all sources', () => {
      const sources = artDirectedSources('/test.jpg')
      for (const source of Object.values(sources)) {
        expect(source.srcSet).toContain('format=avif')
      }
    })
  })

  describe('Constants', () => {
    it('has responsive breakpoints', () => {
      expect(RESPONSIVE_BREAKPOINTS.mobile380).toBe(380)
      expect(RESPONSIVE_BREAKPOINTS.tablet768).toBe(768)
      expect(RESPONSIVE_BREAKPOINTS.desktop1440).toBe(1440)
    })

    it('has standard quality levels', () => {
      expect(IMAGE_QUALITIES.thumbnail).toBe(50)
      expect(IMAGE_QUALITIES.preview).toBe(60)
      expect(IMAGE_QUALITIES.standard).toBe(75)
      expect(IMAGE_QUALITIES.hq).toBe(90)
      expect(IMAGE_QUALITIES.lossless).toBe(95)
    })
  })

  describe('isR2Enabled', () => {
    it('returns false when env vars are not set', () => {
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '')
      vi.stubEnv('CLOUDFLARE_R2_PUBLIC_DOMAIN', '')
      vi.stubEnv('CLOUDFLARE_R2_API_TOKEN', '')
      expect(isR2Enabled()).toBe(false)
    })

    it('returns true when all required env vars are set', () => {
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'abc123')
      vi.stubEnv('CLOUDFLARE_R2_PUBLIC_DOMAIN', 'https://cdn.example.com')
      vi.stubEnv('CLOUDFLARE_R2_API_TOKEN', 'token123')
      expect(isR2Enabled()).toBe(true)
    })

    it('returns false when account ID is missing', () => {
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '')
      vi.stubEnv('CLOUDFLARE_R2_PUBLIC_DOMAIN', 'https://cdn.example.com')
      vi.stubEnv('CLOUDFLARE_R2_API_TOKEN', 'token123')
      expect(isR2Enabled()).toBe(false)
    })

    it('returns false when public domain is missing', () => {
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'abc123')
      vi.stubEnv('CLOUDFLARE_R2_PUBLIC_DOMAIN', '')
      vi.stubEnv('CLOUDFLARE_R2_API_TOKEN', 'token123')
      expect(isR2Enabled()).toBe(false)
    })
  })
})
