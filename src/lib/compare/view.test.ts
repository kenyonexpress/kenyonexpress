import { describe, expect, it } from 'vitest'
import { EMPTY_CELL, buildCompareRows } from './rows'
import { type CompareProductRow, attributesOf, highlightsOf, toCompareViewItem } from './view'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

function row(over: Partial<CompareProductRow> = {}): CompareProductRow {
  return {
    id: A,
    name_he: 'ארוחה זוגית',
    slug: 'couple-meal',
    images: ['https://img/1.webp', 'https://img/2.webp'],
    kenyon_price: 80,
    price_ils: 80,
    full_price: 200,
    stock_quantity: 5,
    status: 'active',
    deleted_at: null,
    type: 'physical',
    is_coupon_enabled: true,
    brand: ' מסעדת הים ',
    sku: 'SKU-1',
    city: 'חיפה',
    cashback_percent: '5',
    requires_shipping: false,
    short_description_he: 'שתי מנות עיקריות וקינוח',
    highlights: ['כולל שתייה', ' ', 7, 'חניה חינם'],
    attributes: { כשרות: 'מהדרין', מושבים: 40, ignored: { nested: true } },
    category: { name_he: 'מסעדות', slug: 'restaurants-cafes' },
    supplier: [{ name: 'הים הכחול' }],
    ...over,
  }
}

describe('toCompareViewItem', () => {
  it('maps a live coupon row onto the column the page paints', () => {
    const item = toCompareViewItem(row())
    expect(item).toMatchObject({
      productId: A,
      name: 'ארוחה זוגית',
      slug: 'couple-meal',
      image: 'https://img/1.webp',
      priceIls: 80,
      fullPriceIls: 200,
      discountPercent: 60,
      available: true,
      soldOut: false,
      typeLabel: 'קופון',
      categoryName: 'מסעדות',
      categorySlug: 'restaurants-cafes',
      supplierName: 'הים הכחול',
      brand: 'מסעדת הים',
      sku: 'SKU-1',
      city: 'חיפה',
      cashbackPercent: 5,
      requiresShipping: false,
      shortDescription: 'שתי מנות עיקריות וקינוח',
      highlights: ['כולל שתייה', 'חניה חינם'],
      attributes: [
        { label: 'כשרות', value: 'מהדרין' },
        { label: 'מושבים', value: '40' },
      ],
    })
  })

  it('reads the type from the enum when the coupon opt-in is off', () => {
    expect(toCompareViewItem(row({ is_coupon_enabled: false })).typeLabel).toBe('מוצר פיזי')
    expect(toCompareViewItem(row({ is_coupon_enabled: false, type: 'weird' })).typeLabel).toBe(
      'שירות',
    )
  })

  it('shows no discount when the full price is not above the price', () => {
    const item = toCompareViewItem(row({ full_price: 80 }))
    expect(item.fullPriceIls).toBeNull()
    expect(item.discountPercent).toBeNull()
  })

  it('marks sold out, and unlinks an inactive product', () => {
    expect(toCompareViewItem(row({ stock_quantity: 0 }))).toMatchObject({
      available: false,
      soldOut: true,
      slug: 'couple-meal',
    })
    expect(toCompareViewItem(row({ status: 'draft' }))).toMatchObject({
      available: false,
      soldOut: false,
      slug: null,
    })
  })

  it('falls back to price_ils, an empty image list and null joins', () => {
    const item = toCompareViewItem(
      row({
        kenyon_price: null,
        price_ils: '45.5',
        images: 'not-a-list',
        category: null,
        supplier: null,
        brand: '  ',
        highlights: null,
        attributes: null,
      }),
    )
    expect(item.priceIls).toBe(45.5)
    expect(item.image).toBeNull()
    expect(item.categoryName).toBeNull()
    expect(item.supplierName).toBeNull()
    expect(item.brand).toBeNull()
    expect(item.highlights).toEqual([])
    expect(item.attributes).toEqual([])
  })
})

describe('attributesOf', () => {
  it('accepts the array shape with label or name', () => {
    expect(
      attributesOf([
        { label: 'צבע', value: 'שחור' },
        { name: 'גודל', value: 'L' },
        { key: 'משקל', value: 2 },
        { label: '', value: 'x' },
        { label: 'ריק', value: '' },
        null,
      ]),
    ).toEqual([
      { label: 'צבע', value: 'שחור' },
      { label: 'גודל', value: 'L' },
      { label: 'משקל', value: '2' },
    ])
  })

  it('accepts the object shape and skips nested values', () => {
    expect(attributesOf({ a: 'x', b: true, c: { d: 1 }, e: null })).toEqual([
      { label: 'a', value: 'x' },
      { label: 'b', value: 'true' },
    ])
  })
})

describe('highlightsOf', () => {
  it('keeps trimmed non-empty strings only', () => {
    expect(highlightsOf([' a ', '', 3, null, 'b'])).toEqual(['a', 'b'])
    expect(highlightsOf('a')).toEqual([])
  })
})

describe('buildCompareRows', () => {
  const left = toCompareViewItem(row())
  const right = toCompareViewItem(
    row({
      id: B,
      name_he: 'ארוחה משפחתית',
      kenyon_price: 120,
      full_price: 300,
      stock_quantity: 0,
      attributes: { כשרות: 'מהדרין', 'אזור ישיבה': 'חוץ' },
    }),
  )

  it('puts price first and the attribute union last, in column order', () => {
    const rows = buildCompareRows([left, right])
    expect(rows[0]).toMatchObject({ key: 'price', label: 'מחיר' })
    expect(rows[0]?.cells.map((c) => c?.replace(/[\u00a0\u2066-\u2069]/g, ''))).toEqual([
      '80₪',
      '120₪',
    ])
    const keys = rows.map((r) => r.key)
    expect(keys.slice(-3)).toEqual(['attr:כשרות', 'attr:מושבים', 'attr:אזור ישיבה'])
    const seating = rows.find((r) => r.key === 'attr:אזור ישיבה')
    expect(seating?.cells).toEqual([null, 'חוץ'])
  })

  it('marks rows where every column agrees, so the page can hide them', () => {
    const rows = buildCompareRows([left, right])
    const by = (k: string) => rows.find((r) => r.key === k)
    expect(by('category')?.allSame).toBe(true)
    expect(by('type')?.allSame).toBe(true)
    expect(by('attr:כשרות')?.allSame).toBe(true)
    expect(by('price')?.allSame).toBe(false)
    expect(by('availability')?.cells).toEqual(['במלאי', 'אזל מהמלאי'])
    expect(by('availability')?.allSame).toBe(false)
  })

  it('drops a row nobody filled and keeps one that a single column fills', () => {
    const bare = toCompareViewItem(
      row({ brand: null, sku: null, city: null, highlights: [], short_description_he: null }),
    )
    const rows = buildCompareRows([bare, bare])
    const keys = rows.map((r) => r.key)
    expect(keys).not.toContain('brand')
    expect(keys).not.toContain('sku')
    expect(keys).not.toContain('highlights')
    const mixed = buildCompareRows([bare, left])
    expect(mixed.find((r) => r.key === 'brand')?.cells).toEqual([null, 'מסעדת הים'])
  })

  it('treats a single column as all-same and exposes the empty glyph', () => {
    const rows = buildCompareRows([left])
    expect(rows.every((r) => r.allSame)).toBe(true)
    expect(EMPTY_CELL).toBe('—')
  })
})
