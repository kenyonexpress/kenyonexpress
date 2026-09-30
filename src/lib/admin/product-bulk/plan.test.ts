import { describe, expect, it } from 'vitest'
import {
  type BulkProductRow,
  bulkOperationSchema,
  currentImageUrls,
  describeOperation,
  isMoneyOperation,
  planProductChange,
  replaceAllLiteral,
} from './plan'

function row(overrides: Partial<BulkProductRow> = {}): BulkProductRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'shoe',
    name_he: 'נעל ספורט',
    name_en: 'Sport Shoe',
    sku: 'AB-100',
    type: 'physical',
    status: 'active',
    kenyon_price: 100,
    full_price: 150,
    coupon_price_ils: null,
    discount_percent: null,
    stock_quantity: 10,
    description_he: 'נעל נוחה לריצה',
    short_description_he: 'נעל',
    brand: 'Nike',
    seo_title: null,
    seo_description: null,
    images: ['https://cdn.kenyonexpress.co.il/old.jpg'],
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

function op(raw: unknown) {
  return bulkOperationSchema.parse(raw)
}

describe('bulkOperationSchema', () => {
  it('coerces numeric strings and refuses out-of-range values', () => {
    expect(op({ kind: 'price', mode: 'percent', value: '-10' })).toEqual({
      kind: 'price',
      mode: 'percent',
      value: -10,
    })
    expect(
      bulkOperationSchema.safeParse({ kind: 'price', mode: 'percent', value: -95 }).success,
    ).toBe(false)
    expect(bulkOperationSchema.safeParse({ kind: 'price', mode: 'set', value: 0 }).success).toBe(
      false,
    )
    expect(bulkOperationSchema.safeParse({ kind: 'stock', mode: 'set', value: 1.5 }).success).toBe(
      false,
    )
    expect(bulkOperationSchema.safeParse({ kind: 'stock', mode: 'set', value: -1 }).success).toBe(
      false,
    )
    expect(bulkOperationSchema.safeParse({ kind: 'stock', mode: 'delta', value: 0 }).success).toBe(
      false,
    )
    expect(bulkOperationSchema.safeParse({ kind: 'discount', value: 101 }).success).toBe(false)
    expect(op({ kind: 'discount', value: '' })).toEqual({ kind: 'discount', value: null })
    expect(
      bulkOperationSchema.safeParse({ kind: 'replace', field: 'slug', find: 'a', replace: 'b' })
        .success,
    ).toBe(false)
    expect(
      bulkOperationSchema.safeParse({ kind: 'replace', field: 'name_he', find: '', replace: 'b' })
        .success,
    ).toBe(false)
    expect(op({ kind: 'images', mode: 'replace', prefix: '/catalog/' })).toEqual({
      kind: 'images',
      mode: 'replace',
      prefix: 'catalog/',
    })
  })

  it('knows which operations touch money', () => {
    expect(isMoneyOperation(op({ kind: 'price', mode: 'set', value: 5 }))).toBe(true)
    expect(isMoneyOperation(op({ kind: 'discount', value: 5 }))).toBe(true)
    expect(isMoneyOperation(op({ kind: 'stock', mode: 'set', value: 5 }))).toBe(false)
  })
})

describe('planProductChange: price', () => {
  it('scales kenyon and full price together in agorot, mirroring price_ils', () => {
    const out = planProductChange(
      row({ kenyon_price: 33.35, full_price: 50 }),
      op({ kind: 'price', mode: 'percent', value: -10 }),
    )
    expect(out).toEqual({
      status: 'change',
      fields: { kenyon_price: 30.02, price_ils: 30.02, full_price: 45 },
      prior: { kenyon_price: 33.35, price_ils: null, full_price: 50 },
    })
  })

  it('sets an absolute price and refuses one above the compare-at', () => {
    expect(planProductChange(row(), op({ kind: 'price', mode: 'set', value: 120 }))).toMatchObject({
      status: 'change',
      fields: { kenyon_price: 120, price_ils: 120 },
    })
    expect(planProductChange(row(), op({ kind: 'price', mode: 'set', value: 160 }))).toEqual({
      status: 'skip',
      reason: 'המחיר המלא נמוך מהמחיר החדש',
    })
  })

  it('skips a product with no price, a recurring product, and an unchanged set', () => {
    expect(
      planProductChange(
        row({ kenyon_price: null }),
        op({ kind: 'price', mode: 'percent', value: 5 }),
      ),
    ).toEqual({
      status: 'skip',
      reason: 'אין מחיר להתאים',
    })
    expect(
      planProductChange(row({ type: 'recurring' }), op({ kind: 'price', mode: 'set', value: 5 }))
        .status,
    ).toBe('skip')
    expect(
      planProductChange(row({ kenyon_price: 100 }), op({ kind: 'price', mode: 'set', value: 100 })),
    ).toEqual({
      status: 'unchanged',
    })
  })

  it('re-derives a coupon badge from the new sticker and refuses a sticker below the charge', () => {
    const coupon = row({
      type: 'coupon',
      kenyon_price: 100,
      full_price: null,
      coupon_price_ils: 20,
      discount_percent: 80,
    })
    expect(planProductChange(coupon, op({ kind: 'price', mode: 'set', value: 80 }))).toEqual({
      status: 'change',
      fields: { kenyon_price: 80, price_ils: 80, discount_percent: 75 },
      prior: { kenyon_price: 100, price_ils: null, discount_percent: 80 },
    })
    expect(planProductChange(coupon, op({ kind: 'price', mode: 'set', value: 10 }))).toEqual({
      status: 'skip',
      reason: 'מחיר הקופון גבוה מהמחיר החדש',
    })
  })
})

describe('planProductChange: stock and discount', () => {
  it('sets, adds and clamps stock at zero, physical only', () => {
    expect(planProductChange(row(), op({ kind: 'stock', mode: 'set', value: 3 }))).toEqual({
      status: 'change',
      fields: { stock_quantity: 3 },
      prior: { stock_quantity: 10 },
    })
    expect(
      planProductChange(row(), op({ kind: 'stock', mode: 'delta', value: -25 })),
    ).toMatchObject({
      fields: { stock_quantity: 0 },
    })
    expect(
      planProductChange(
        row({ stock_quantity: null }),
        op({ kind: 'stock', mode: 'delta', value: 5 }),
      ),
    ).toMatchObject({
      fields: { stock_quantity: 5 },
    })
    expect(planProductChange(row(), op({ kind: 'stock', mode: 'set', value: 10 })).status).toBe(
      'unchanged',
    )
    expect(
      planProductChange(row({ type: 'coupon' }), op({ kind: 'stock', mode: 'set', value: 1 }))
        .status,
    ).toBe('skip')
  })

  it('sets or clears a physical discount and leaves coupons alone', () => {
    expect(planProductChange(row(), op({ kind: 'discount', value: 15 }))).toEqual({
      status: 'change',
      fields: { discount_percent: 15 },
      prior: { discount_percent: null },
    })
    expect(
      planProductChange(row({ discount_percent: 15 }), op({ kind: 'discount', value: '' })),
    ).toMatchObject({
      fields: { discount_percent: null },
    })
    expect(planProductChange(row(), op({ kind: 'discount', value: '' })).status).toBe('unchanged')
    expect(planProductChange(row({ type: 'coupon' }), op({ kind: 'discount', value: 5 }))).toEqual({
      status: 'skip',
      reason: 'הנחה בקופון נגזרת משני המחירים',
    })
  })
})

describe('planProductChange: replace', () => {
  it('replaces every literal occurrence, with regex characters inert', () => {
    expect(replaceAllLiteral('a.b a.b axb', 'a.b', 'X', false)).toBe('X X axb')
    expect(replaceAllLiteral('Nike nike', 'nike', 'Adidas', true)).toBe('Adidas Adidas')
    expect(replaceAllLiteral('price', 'i', '$&', false)).toBe('pr$&ce')
  })

  it('changes only rows that contain the text and empties optional fields to null', () => {
    expect(
      planProductChange(
        row(),
        op({ kind: 'replace', field: 'brand', find: 'Nike', replace: 'Adidas' }),
      ),
    ).toEqual({
      status: 'change',
      fields: { brand: 'Adidas' },
      prior: { brand: 'Nike' },
    })
    expect(
      planProductChange(row(), op({ kind: 'replace', field: 'brand', find: 'Puma', replace: 'X' }))
        .status,
    ).toBe('unchanged')
    expect(
      planProductChange(
        row({ brand: null }),
        op({ kind: 'replace', field: 'brand', find: 'N', replace: 'X' }),
      ).status,
    ).toBe('unchanged')
    expect(
      planProductChange(row(), op({ kind: 'replace', field: 'brand', find: 'Nike', replace: ' ' })),
    ).toMatchObject({
      fields: { brand: null },
    })
  })

  it('refuses a result the product form would refuse', () => {
    expect(
      planProductChange(
        row(),
        op({ kind: 'replace', field: 'name_he', find: 'נעל ספורט', replace: 'א' }),
      ),
    ).toEqual({
      status: 'skip',
      reason: 'שם בעברית: התוצאה קצרה מ-2 תווים',
    })
    expect(
      planProductChange(
        row(),
        op({
          kind: 'replace',
          field: 'short_description_he',
          find: 'נעל',
          replace: 'x'.repeat(301),
        }),
      ),
    ).toEqual({ status: 'skip', reason: 'תיאור קצר: התוצאה ארוכה מ-300 תווים' })
  })
})

describe('planProductChange: images', () => {
  const ctx = {
    imagesBySku: new Map([
      [
        'ab-100',
        [
          'https://cdn.kenyonexpress.co.il/AB-100.jpg',
          'https://cdn.kenyonexpress.co.il/AB-100-1.jpg',
        ],
      ],
    ]),
  }

  it('replaces or appends the matched gallery, looked up by lower-cased sku', () => {
    expect(
      planProductChange(row(), op({ kind: 'images', mode: 'replace', prefix: '' }), ctx),
    ).toEqual({
      status: 'change',
      fields: {
        images: [
          'https://cdn.kenyonexpress.co.il/AB-100.jpg',
          'https://cdn.kenyonexpress.co.il/AB-100-1.jpg',
        ],
      },
      prior: { images: ['https://cdn.kenyonexpress.co.il/old.jpg'] },
    })
    expect(
      planProductChange(row(), op({ kind: 'images', mode: 'append', prefix: '' }), ctx),
    ).toMatchObject({
      fields: {
        images: [
          'https://cdn.kenyonexpress.co.il/old.jpg',
          'https://cdn.kenyonexpress.co.il/AB-100.jpg',
          'https://cdn.kenyonexpress.co.il/AB-100-1.jpg',
        ],
      },
    })
  })

  it('skips a product without a sku or without a match, and detects no-op', () => {
    expect(
      planProductChange(
        row({ sku: null }),
        op({ kind: 'images', mode: 'replace', prefix: '' }),
        ctx,
      ).status,
    ).toBe('skip')
    expect(
      planProductChange(
        row({ sku: 'ZZ-1' }),
        op({ kind: 'images', mode: 'replace', prefix: '' }),
        ctx,
      ),
    ).toEqual({
      status: 'skip',
      reason: 'לא נמצאו תמונות למק"ט הזה',
    })
    const already = row({
      images: [
        'https://cdn.kenyonexpress.co.il/AB-100.jpg',
        'https://cdn.kenyonexpress.co.il/AB-100-1.jpg',
      ],
    })
    expect(
      planProductChange(already, op({ kind: 'images', mode: 'replace', prefix: '' }), ctx).status,
    ).toBe('unchanged')
  })

  it('reads only string entries off the images jsonb', () => {
    expect(currentImageUrls(['a', 1, null, { url: 'b' }, 'c'])).toEqual(['a', 'c'])
    expect(currentImageUrls('not-an-array')).toEqual([])
  })
})

describe('describeOperation', () => {
  it('names each operation in Hebrew', () => {
    expect(describeOperation(op({ kind: 'price', mode: 'percent', value: 10 }))).toBe('מחירים +10%')
    expect(describeOperation(op({ kind: 'price', mode: 'set', value: 49.9 }))).toBe('מחיר 49.9 ₪')
    expect(describeOperation(op({ kind: 'stock', mode: 'delta', value: -5 }))).toBe('מלאי -5')
    expect(describeOperation(op({ kind: 'discount', value: '' }))).toBe('ביטול הנחה')
    expect(
      describeOperation(op({ kind: 'replace', field: 'brand', find: 'a', replace: 'b' })),
    ).toBe('החלפת "a" ב-"b" במותג')
    expect(describeOperation(op({ kind: 'images', mode: 'append', prefix: 'x/' }))).toBe(
      'תמונות מ-R2 (x/) · הוספה',
    )
  })
})
