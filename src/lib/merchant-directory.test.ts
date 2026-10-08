import { describe, expect, it } from 'vitest'
import {
  type DirectoryProductRow,
  type DirectorySupplierRow,
  MAX_CATEGORIES_PER_MERCHANT,
  MERCHANT_DIRECTORY_PRODUCT_COLUMNS,
  MERCHANT_DIRECTORY_SUPPLIER_COLUMNS,
  buildMerchantDirectory,
  couponCountLabel,
} from './merchant-directory'

const supplier = (over: Partial<DirectorySupplierRow> & { id: string }): DirectorySupplierRow => ({
  name: `ספק ${over.id}`,
  city: null,
  logo_url: null,
  status: 'active',
  deleted_at: null,
  ...over,
})

const product = (supplierId: string | null, category?: { name_he: string; slug: string }) =>
  ({ supplier_id: supplierId, categories: category ?? null }) satisfies DirectoryProductRow

const FOOD = { name_he: 'מסעדות ובתי קפה', slug: 'restaurants-cafes' }
const SPA = { name_he: 'טיפוח בריאות ויופי', slug: 'beauty' }
const HOTELS = { name_he: 'צימרים מלונות ונופש', slug: 'hotels' }
const KIDS = { name_he: 'תינוקות וילדים', slug: 'kids' }

describe('the columns the directory reads', () => {
  it('never select a rating, a review, a commission or a contact column', () => {
    for (const columns of [
      MERCHANT_DIRECTORY_SUPPLIER_COLUMNS,
      MERCHANT_DIRECTORY_PRODUCT_COLUMNS,
    ]) {
      expect(columns).not.toMatch(/rating/i)
      expect(columns).not.toMatch(/review/i)
      expect(columns).not.toMatch(/platform_percent|supplier_split|commission/)
      expect(columns).not.toMatch(/contact_|notes|business_id|whatsapp/)
    }
  })
})

describe('buildMerchantDirectory', () => {
  it('lists only active, non-deleted suppliers', () => {
    const out = buildMerchantDirectory(
      [
        supplier({ id: 'a' }),
        supplier({ id: 'b', status: 'pending' }),
        supplier({ id: 'c', deleted_at: '2026-10-01T00:00:00Z' }),
        supplier({ id: 'd', status: 'inactive' }),
      ],
      [],
    )
    expect(out.map((m) => m.id)).toEqual(['a'])
  })

  it('counts the products under each supplier as its coupons', () => {
    const out = buildMerchantDirectory(
      [supplier({ id: 'a' }), supplier({ id: 'b' })],
      [product('a', FOOD), product('a', FOOD), product('b', SPA), product(null, SPA)],
    )
    expect(out.find((m) => m.id === 'a')?.couponCount).toBe(2)
    expect(out.find((m) => m.id === 'b')?.couponCount).toBe(1)
  })

  it('ignores a product whose supplier is not listed', () => {
    const out = buildMerchantDirectory(
      [supplier({ id: 'a' })],
      [product('gone', FOOD), product('a', FOOD)],
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.couponCount).toBe(1)
  })

  it('derives categories from the products, most frequent first, capped', () => {
    const rows = [
      ...Array.from({ length: 7 }, () => product('a', FOOD)),
      ...Array.from({ length: 5 }, () => product('a', SPA)),
      ...Array.from({ length: 3 }, () => product('a', HOTELS)),
      ...Array.from({ length: 2 }, () => product('a', KIDS)),
      product('a'),
    ]
    const [merchant] = buildMerchantDirectory([supplier({ id: 'a' })], rows)
    expect(merchant?.categories.map((c) => c.slug)).toEqual([
      'restaurants-cafes',
      'beauty',
      'hotels',
    ])
    expect(merchant?.categories).toHaveLength(MAX_CATEGORIES_PER_MERCHANT)
    // The uncategorised product still counts as a coupon.
    expect(merchant?.couponCount).toBe(18)
  })

  it('accepts the embed as an array, the shape PostgREST uses for a to-many hint', () => {
    const [merchant] = buildMerchantDirectory(
      [supplier({ id: 'a' })],
      [{ supplier_id: 'a', categories: [FOOD] }],
    )
    expect(merchant?.categories).toEqual([FOOD])
  })

  it('orders merchants with coupons first, by count, then by Hebrew name; empty ones last', () => {
    const out = buildMerchantDirectory(
      [
        supplier({ id: 'empty-b', name: 'בלי' }),
        supplier({ id: 'one-g', name: 'גימל' }),
        supplier({ id: 'two', name: 'תו' }),
        supplier({ id: 'one-a', name: 'אלף' }),
        supplier({ id: 'empty-a', name: 'אין' }),
      ],
      [product('two', FOOD), product('two', FOOD), product('one-g', FOOD), product('one-a', SPA)],
    )
    expect(out.map((m) => m.id)).toEqual(['two', 'one-a', 'one-g', 'empty-a', 'empty-b'])
  })

  it('trims city and logo and turns blanks into null', () => {
    const [merchant] = buildMerchantDirectory(
      [supplier({ id: 'a', city: '  חיפה ', logo_url: '   ' })],
      [],
    )
    expect(merchant?.city).toBe('חיפה')
    expect(merchant?.logoUrl).toBeNull()
  })

  it('carries no rating on an entry, by construction', () => {
    const [merchant] = buildMerchantDirectory([supplier({ id: 'a' })], [product('a', FOOD)])
    expect(Object.keys(merchant ?? {})).toEqual([
      'id',
      'name',
      'city',
      'logoUrl',
      'categories',
      'couponCount',
    ])
  })
})

describe('couponCountLabel', () => {
  it('speaks Hebrew for none, one and many', () => {
    expect(couponCountLabel(0)).toBe('אין קופונים כרגע')
    expect(couponCountLabel(1)).toBe('קופון אחד')
    expect(couponCountLabel(12)).toBe('12 קופונים')
  })
})
