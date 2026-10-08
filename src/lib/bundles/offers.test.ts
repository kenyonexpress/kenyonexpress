import { bundleFromRow } from '@/lib/bundles/load'
import { toOffer } from '@/lib/bundles/offers'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

/**
 * The two row-to-shape joins behind the bundle readers (STEP 60). The
 * database answers numerics as strings and embeds as arrays-or-objects;
 * these are the one place that is normalised, so they are pinned.
 */

const DEFINITION = {
  id: 'b1',
  name_he: 'ספל וצלחת',
  discount_agorot: 1500,
  starts_at: null,
  expires_at: null,
  items: [
    { product_id: 'mug', quantity: 1 },
    { product_id: 'plate', quantity: 2 },
  ],
}

function product(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name_he: id,
    slug: id,
    images: [`https://cdn.example/${id}.jpg`],
    kenyon_price: 40,
    status: 'active',
    deleted_at: null,
    ...overrides,
  }
}

describe('bundleFromRow', () => {
  it('normalises string numerics and a missing embed', () => {
    expect(
      bundleFromRow({
        id: 'b1',
        name_he: 'x',
        discount_agorot: '1500',
        starts_at: null,
        expires_at: '2026-12-01T00:00:00Z',
        product_bundle_items: [{ product_id: 'mug', quantity: '2' }],
      }),
    ).toEqual({
      id: 'b1',
      name_he: 'x',
      discount_agorot: 1500,
      starts_at: null,
      expires_at: '2026-12-01T00:00:00Z',
      items: [{ product_id: 'mug', quantity: 2 }],
    })
    expect(
      bundleFromRow({
        id: 'b2',
        name_he: 'y',
        discount_agorot: 100,
        starts_at: null,
        expires_at: null,
        product_bundle_items: null,
      }).items,
    ).toEqual([])
  })
})

describe('toOffer', () => {
  it('builds the members with quantities, the first image, and the worth in agorot', () => {
    const products = new Map([
      ['mug', product('mug', { kenyon_price: 40 })],
      ['plate', product('plate', { kenyon_price: '60.5' })],
    ])
    const [offer] = toOffer(DEFINITION, 'תיאור', products)
    expect(offer).toMatchObject({
      id: 'b1',
      name_he: 'ספל וצלחת',
      description_he: 'תיאור',
      discount_agorot: 1500,
      worth_agorot: 4000 + 6050 * 2,
    })
    expect(offer?.members).toEqual([
      {
        product_id: 'mug',
        quantity: 1,
        name_he: 'mug',
        slug: 'mug',
        image_url: 'https://cdn.example/mug.jpg',
        price_ils: 40,
      },
      {
        product_id: 'plate',
        quantity: 2,
        name_he: 'plate',
        slug: 'plate',
        image_url: 'https://cdn.example/plate.jpg',
        price_ils: 60.5,
      },
    ])
  })

  it('offers nothing when a member is missing, inactive, deleted or unpriced', () => {
    const active = product('mug')
    expect(toOffer(DEFINITION, null, new Map([['mug', active]]))).toEqual([])
    expect(
      toOffer(
        DEFINITION,
        null,
        new Map([
          ['mug', active],
          ['plate', product('plate', { kenyon_price: 0 })],
        ]),
      ),
    ).toEqual([])
    expect(
      toOffer(
        DEFINITION,
        null,
        new Map([
          ['mug', active],
          ['plate', product('plate', { kenyon_price: null })],
        ]),
      ),
    ).toEqual([])
  })
})

describe('isMissingBundleTable', () => {
  it('recognises the Postgres code, the PostgREST code and either message', async () => {
    const { isMissingBundleTable } = await import('@/lib/bundles/load')
    expect(isMissingBundleTable({ code: '42P01', message: 'x' })).toBe(true)
    expect(
      isMissingBundleTable({
        code: 'PGRST205',
        message: "Could not find the table 'public.product_bundle_items' in the schema cache",
      }),
    ).toBe(true)
    expect(isMissingBundleTable({ message: 'relation "product_bundles" does not exist' })).toBe(
      true,
    )
    expect(isMissingBundleTable({ code: '23503', message: 'fk' })).toBe(false)
    expect(isMissingBundleTable(null)).toBe(false)
  })
})
