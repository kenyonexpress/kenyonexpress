import { describe, expect, it } from 'vitest'
import {
  PENDING_BUCKET,
  PUBLISH_BUCKET,
  pendingObjectPath,
  publishedObjectPath,
  validateAlt,
  validateSubmissionFile,
} from './image-submissions'

describe('validateSubmissionFile', () => {
  it('accepts the raster types the public buckets accept, with the right extension', () => {
    expect(validateSubmissionFile({ type: 'image/png', size: 10 }, 'product')).toEqual({
      ok: true,
      ext: 'png',
    })
    expect(validateSubmissionFile({ type: 'image/jpeg', size: 10 }, 'logo')).toEqual({
      ok: true,
      ext: 'jpg',
    })
  })

  it('refuses svg (a script carrier), gif, empties and oversize per kind', () => {
    expect(validateSubmissionFile({ type: 'image/svg+xml', size: 10 }, 'logo').ok).toBe(false)
    expect(validateSubmissionFile({ type: 'image/gif', size: 10 }, 'product').ok).toBe(false)
    expect(validateSubmissionFile({ type: 'image/png', size: 0 }, 'product').ok).toBe(false)
    expect(
      validateSubmissionFile({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }, 'logo').ok,
    ).toBe(false)
    expect(
      validateSubmissionFile({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }, 'product').ok,
    ).toBe(true)
  })
})

describe('validateAlt', () => {
  it('requires words and bounds them', () => {
    expect(validateAlt('  ').ok).toBe(false)
    expect(validateAlt(' צימר בצפון ')).toEqual({ ok: true, alt: 'צימר בצפון' })
    expect(validateAlt('x'.repeat(201)).ok).toBe(false)
  })
})

describe('object paths', () => {
  it('scope the pending key by supplier and randomise the name', () => {
    expect(pendingObjectPath('sup', 'product', 'png', 'r')).toBe('sup/product/r.png')
    expect(pendingObjectPath('sup', 'logo', 'jpg')).toMatch(/^sup\/logo\/[0-9a-f-]{36}\.jpg$/)
  })

  it('publish into the existing public buckets under a stable key', () => {
    expect(PENDING_BUCKET).toBe('supplier-pending')
    expect(PUBLISH_BUCKET.product).toBe('product-images')
    expect(PUBLISH_BUCKET.logo).toBe('vendor-logos')
    expect(publishedObjectPath('product', 'prod', 'sub', 'webp')).toBe('prod/sub.webp')
    expect(publishedObjectPath('logo', 'sup', 'sub', 'png')).toBe('logos/sup/sub.png')
  })
})
