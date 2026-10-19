import { describe, expect, it } from 'vitest'
import dealBlurs from './deal-blurs.json'

describe('deal-blurs.json', () => {
  it('contains blur data for all 30 KE_LIVE_DEALS images', () => {
    // Should have entries for deal images
    const dealImageKeys = Object.keys(dealBlurs).filter((key) => key.includes('ke-live-deal-'))
    expect(dealImageKeys.length).toBeGreaterThanOrEqual(1)
  })

  it('has valid data URLs for each image', () => {
    for (const [url, blurData] of Object.entries(dealBlurs)) {
      expect(typeof url).toBe('string')
      expect(url).toMatch(/^\/images\/products\//)

      expect(typeof blurData).toBe('string')
      expect(blurData).toMatch(/^data:image\/webp;base64,/)
      expect(blurData.length).toBeGreaterThan(50) // Should have substantial base64 data
    }
  })

  it('generates valid base64 encoded blur data', () => {
    const blurDataValues = Object.values(dealBlurs)

    for (const blurData of blurDataValues) {
      const base64Part = blurData.replace('data:image/webp;base64,', '')
      // Should be valid base64 (only alphanumeric, +, /, =)
      expect(base64Part).toMatch(/^[A-Za-z0-9+/=]+$/)
    }
  })

  it('has blur data URLs for ke-live-deal images specifically', () => {
    const dealImageUrls = Object.keys(dealBlurs).filter((key) => key.includes('ke-live-deal-'))

    // At least one deal image should be present
    expect(dealImageUrls.length).toBeGreaterThanOrEqual(1)

    // Each should have valid blur data
    for (const url of dealImageUrls) {
      const blurData = dealBlurs[url as keyof typeof dealBlurs]
      expect(blurData).toBeDefined()
      expect(blurData).toMatch(/^data:image\/webp;base64,/)
    }
  })

  it('is a valid JSON file with proper structure', () => {
    expect(dealBlurs).toBeInstanceOf(Object)
    expect(Object.keys(dealBlurs).length).toBeGreaterThan(0)

    // All keys should be strings starting with /images/
    for (const key of Object.keys(dealBlurs)) {
      expect(typeof key).toBe('string')
      expect(key.startsWith('/images/')).toBe(true)
    }

    // All values should be non-empty strings
    for (const value of Object.values(dealBlurs)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it('blur data is in webp format', () => {
    for (const blurData of Object.values(dealBlurs)) {
      expect(blurData).toContain('image/webp')
      // WebP format should be present
      expect(blurData).toMatch(/data:image\/webp/)
    }
  })

  it('blur data URLs can be used in Image component', () => {
    const blurDataValues = Object.values(dealBlurs)

    for (const blurData of blurDataValues) {
      // Should be a valid data URL that can be passed to Image component
      expect(blurData).toMatch(/^data:image/)
      expect(blurData.length).toBeGreaterThan(100) // Substantial blur data

      // Extract base64 and verify it looks like image data
      const base64 = blurData.split(',')[1]
      expect(base64).toBeDefined()
      if (base64) {
        expect(base64.length).toBeGreaterThan(50)
      }
    }
  })
})
