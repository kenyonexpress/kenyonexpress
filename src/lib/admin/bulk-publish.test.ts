import { describe, expect, it } from 'vitest'
import {
  type BulkPublishProduct,
  type BulkPublishSupplier,
  bulkPublishErrorMessage,
  findUnpublishableProducts,
} from './bulk-publish'

const SUPPLIER: BulkPublishSupplier = {
  id: 'sup-1',
  name: 'פלאפל הכרם',
  contact_phone: '050-1234567',
  address: 'הרצל 12, תל אביב',
  logo_url: 'https://cdn.example.com/logo.png',
  status: 'active',
}

/** A physical product with everything the publish gate asks for. */
const COMPLETE: BulkPublishProduct = {
  id: 'p-1',
  name_he: 'מוצר שלם',
  type: 'physical',
  supplier_id: 'sup-1',
  price_ils: 100,
  platform_percent: 30,
  supplier_split_percent: 70,
  discount_percent: 10,
  coupon_price_ils: null,
  coupon_expiry_days: null,
}

/**
 * The shape of all 19 draft products in the live catalog on 2026-08-11: no
 * supplier, no split, and therefore not publishable.
 */
const INCOMPLETE: BulkPublishProduct = {
  ...COMPLETE,
  id: 'p-2',
  name_he: 'מוצר חסר',
  supplier_id: null,
  platform_percent: null,
  supplier_split_percent: null,
}

describe('findUnpublishableProducts', () => {
  it('passes a product that carries a supplier and a split summing to 100', () => {
    expect(findUnpublishableProducts([COMPLETE], [SUPPLIER])).toEqual([])
  })

  it('blocks a product with no supplier and no percentages', () => {
    const blocked = findUnpublishableProducts([INCOMPLETE], [SUPPLIER])

    expect(blocked).toHaveLength(1)
    expect(blocked[0]!.id).toBe('p-2')
    expect(blocked[0]!.name).toBe('מוצר חסר')
  })

  it('reports every reason at once rather than the first', () => {
    const blocked = findUnpublishableProducts([INCOMPLETE], [SUPPLIER])

    // The missing split and the missing supplier are two separate blockers.
    expect(blocked[0]!.reasons.length).toBeGreaterThan(1)
  })

  it('blocks a split that does not sum to 100, with no fallback applied', () => {
    const lopsided = { ...COMPLETE, platform_percent: 30, supplier_split_percent: 40 }
    const blocked = findUnpublishableProducts([lopsided], [SUPPLIER])

    expect(blocked).toHaveLength(1)
  })

  it('blocks when the supplier id points at a supplier that was not loaded', () => {
    const orphan = { ...COMPLETE, supplier_id: 'sup-missing' }

    expect(findUnpublishableProducts([orphan], [SUPPLIER])).toHaveLength(1)
  })

  it('blocks when the supplier exists but is not active', () => {
    const pending = { ...SUPPLIER, status: 'pending' }

    expect(findUnpublishableProducts([COMPLETE], [pending])).toHaveLength(1)
  })

  it('blocks a supplier missing one of the four mandatory identity details', () => {
    const noAddress = { ...SUPPLIER, address: null }

    expect(findUnpublishableProducts([COMPLETE], [noAddress])).toHaveLength(1)
  })

  it('separates the complete from the incomplete in one mixed batch', () => {
    const blocked = findUnpublishableProducts([COMPLETE, INCOMPLETE], [SUPPLIER])

    expect(blocked.map((b) => b.id)).toEqual(['p-2'])
  })

  it('treats a service product like a physical one: no coupon fields demanded', () => {
    const service = { ...COMPLETE, type: 'service' }

    expect(findUnpublishableProducts([service], [SUPPLIER])).toEqual([])
  })

  it('demands the coupon fields on a coupon product', () => {
    const coupon = { ...COMPLETE, type: 'coupon' }

    // coupon_price_ils and coupon_expiry_days are both null on COMPLETE.
    expect(findUnpublishableProducts([coupon], [SUPPLIER])).toHaveLength(1)
  })

  it('falls back to the id when a product has no Hebrew name', () => {
    const unnamed = { ...INCOMPLETE, name_he: null }

    expect(findUnpublishableProducts([unnamed], [SUPPLIER])[0]!.name).toBe('p-2')
  })

  it('returns nothing for an empty selection', () => {
    expect(findUnpublishableProducts([], [])).toEqual([])
  })
})

describe('bulkPublishErrorMessage', () => {
  it('says nothing was published, so a refusal is not read as a partial one', () => {
    const message = bulkPublishErrorMessage([{ id: 'p-2', name: 'מוצר חסר', reasons: ['חסר ספק'] }])

    expect(message).toContain('לא פורסם דבר')
    expect(message).toContain('מוצר חסר')
    expect(message).toContain('חסר ספק')
  })

  it('counts the products when more than one is blocked', () => {
    const message = bulkPublishErrorMessage([
      { id: 'a', name: 'א', reasons: ['חסר ספק'] },
      { id: 'b', name: 'ב', reasons: ['חסר ספק'] },
    ])

    expect(message).toContain('2 מוצרים')
  })

  it('uses the singular phrasing for exactly one', () => {
    const message = bulkPublishErrorMessage([{ id: 'a', name: 'א', reasons: ['חסר ספק'] }])

    expect(message).toContain('מוצר אחד')
  })
})
