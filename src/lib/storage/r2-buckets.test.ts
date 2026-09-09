import { describe, expect, it } from 'vitest'
import {
  R2_BUCKETS,
  R2_BUCKET_PURPOSES,
  assertValidR2Key,
  isPublicR2Bucket,
  r2BucketName,
} from './r2-buckets'

describe('R2 bucket registry', () => {
  it('declares exactly the four purposes the infra doc provisions', () => {
    // `course-videos` joined in [91]. The list is exact rather than a subset on
    // purpose: a bucket added without a line in `docs/ARCHITECTURE-MEDIA-R2.md`
    // is a bucket nobody provisioned.
    expect(R2_BUCKET_PURPOSES.sort()).toEqual([
      'coupon-qrcodes',
      'course-videos',
      'product-images',
      'user-uploads',
    ])
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

  it('only product-images is public; everything paid for stays private', () => {
    expect(isPublicR2Bucket('product-images')).toBe(true)
    expect(isPublicR2Bucket('coupon-qrcodes')).toBe(false)
    expect(isPublicR2Bucket('user-uploads')).toBe(false)
    // The one that matters most: a lesson is what somebody paid for, so the
    // object must never be publicly addressable.
    expect(isPublicR2Bucket('course-videos')).toBe(false)
  })

  it('every bucket allows at least one content type and a sane size cap', () => {
    // The 20 MB ceiling was written when every bucket held an image or a PDF.
    // `course-videos` is a video bucket and 20 MB would refuse anything longer
    // than a few seconds, so it carries its own limit - still a limit, because
    // what the cap is for is stopping an upload form from being a way to fill a
    // bucket, not enforcing one number everywhere.
    const CAP: Partial<Record<(typeof R2_BUCKET_PURPOSES)[number], number>> = {
      'course-videos': 2 * 1024 * 1024 * 1024,
    }
    for (const purpose of R2_BUCKET_PURPOSES) {
      const cfg = R2_BUCKETS[purpose]
      expect(cfg.allowedTypes.length, purpose).toBeGreaterThan(0)
      expect(cfg.maxBytes, purpose).toBeGreaterThan(0)
      expect(cfg.maxBytes, purpose).toBeLessThanOrEqual(CAP[purpose] ?? 20 * 1024 * 1024)
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
