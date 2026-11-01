import { describe, expect, it } from 'vitest'
import {
  R2_BUCKETS,
  R2_BUCKET_PURPOSES,
  assertValidR2Key,
  isPublicR2Bucket,
  r2BucketName,
} from './r2-buckets'

describe('R2 bucket registry', () => {
  it('declares exactly the three purposes the infra doc provisions', () => {
    expect(R2_BUCKET_PURPOSES.sort()).toEqual(['coupon-qrcodes', 'product-images', 'user-uploads'])
  })

  it('bucket names satisfy R2 naming rules (3-63 chars, lowercase, digits, hyphens)', () => {
    for (const purpose of R2_BUCKET_PURPOSES) {
      const name = r2BucketName(purpose)
      expect(name, purpose).toMatch(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
    }
  })

  it('bucket names are unique', () => {
    const names = R2_BUCKET_PURPOSES.map(r2BucketName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('only product-images is public; QR codes and user uploads stay private', () => {
    expect(isPublicR2Bucket('product-images')).toBe(true)
    expect(isPublicR2Bucket('coupon-qrcodes')).toBe(false)
    expect(isPublicR2Bucket('user-uploads')).toBe(false)
  })

  it('every bucket allows at least one content type and a sane size cap', () => {
    for (const purpose of R2_BUCKET_PURPOSES) {
      const cfg = R2_BUCKETS[purpose]
      expect(cfg.allowedTypes.length, purpose).toBeGreaterThan(0)
      expect(cfg.maxBytes, purpose).toBeGreaterThan(0)
      expect(cfg.maxBytes, purpose).toBeLessThanOrEqual(20 * 1024 * 1024)
    }
  })
})

describe('assertValidR2Key', () => {
  it('accepts normal folder/uuid keys', () => {
    expect(() => assertValidR2Key('products/3f2c-abc.webp')).not.toThrow()
    expect(() => assertValidR2Key('qr/2026/09/order-1234.png')).not.toThrow()
  })

  it.each([
    ['', 'empty'],
    ['/leading.png', 'leading slash'],
    ['trailing/', 'trailing slash'],
    ['a//b.png', 'empty segment'],
    ['a/../b.png', 'dot-dot segment'],
    ['a/./b.png', 'dot segment'],
    ['a\u0000b.png', 'control character'],
    [`${'x'.repeat(1025)}.png`, 'over 1024 chars'],
  ])('rejects %s (%s)', (key) => {
    expect(() => assertValidR2Key(key)).toThrow()
  })
})
