import { describe, expect, it } from 'vitest'
import { agorot } from './money'
import {
  SPLIT_TOTAL,
  assertPublishable,
  buildOrderItemSnapshot,
  completeSplitPair,
  deriveDiscountPercent,
  missingSupplierDetails,
  normalizeIls,
  normalizePercent,
  physicalOnSiteChargeIls,
  previewProductMoney,
  splitOnSiteCharge,
} from './product-money'

const completeSupplier = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'מסעדת השף הגדול',
  phone: '03-1234567',
  address: 'דיזנגוף 100, תל אביב',
  logoUrl: 'https://cdn.example.com/logo.png',
  status: 'active',
}

describe('normalizePercent', () => {
  it('accepts numbers and numeric strings, rounded to two places', () => {
    expect(normalizePercent(30)).toBe(30)
    expect(normalizePercent('15.5')).toBe(15.5)
    expect(normalizePercent(' 12.345 ')).toBe(12.35)
    expect(normalizePercent(0)).toBe(0)
    expect(normalizePercent(100)).toBe(100)
  })

  // A missing percent must stay missing. Collapsing '' to 0 would silently mean
  // "the supplier gets nothing", which is a real outcome and must be chosen.
  it('returns null for missing, non-numeric and out-of-range input', () => {
    expect(normalizePercent('')).toBeNull()
    expect(normalizePercent(null)).toBeNull()
    expect(normalizePercent(undefined)).toBeNull()
    expect(normalizePercent('abc')).toBeNull()
    expect(normalizePercent(Number.NaN)).toBeNull()
    expect(normalizePercent(-1)).toBeNull()
    expect(normalizePercent(100.01)).toBeNull()
  })
})

describe('normalizeIls', () => {
  it('accepts positive amounts only', () => {
    expect(normalizeIls('49.90')).toBe(49.9)
    expect(normalizeIls(10)).toBe(10)
    expect(normalizeIls(0)).toBeNull()
    expect(normalizeIls(-5)).toBeNull()
    expect(normalizeIls('')).toBeNull()
  })
})

describe('completeSplitPair', () => {
  it('derives the complement when only the platform percent is given', () => {
    const result = completeSplitPair({ platformPercent: 30 })
    expect(result).toEqual({ ok: true, pair: { platformPercent: 30, supplierSplitPercent: 70 } })
  })

  it('derives the complement when only the supplier split is given', () => {
    // This is the shape of every one of the 61 live products: the split was set,
    // the platform percent never was.
    const result = completeSplitPair({ supplierSplitPercent: 85 })
    expect(result).toEqual({ ok: true, pair: { platformPercent: 15, supplierSplitPercent: 85 } })
  })

  it('accepts both halves when they sum to 100', () => {
    const result = completeSplitPair({ platformPercent: 12.5, supplierSplitPercent: 87.5 })
    expect(result).toEqual({
      ok: true,
      pair: { platformPercent: 12.5, supplierSplitPercent: 87.5 },
    })
  })

  it('reports a disagreeing pair instead of picking a winner', () => {
    const result = completeSplitPair({ platformPercent: 30, supplierSplitPercent: 80 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.field).toBe('supplier_split_percent')
    expect(result.message).toContain('110')
  })

  it('refuses to invent a split when neither half is given', () => {
    const result = completeSplitPair({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('אין ברירת מחדל')
  })

  it('allows the whole take to sit on either side', () => {
    expect(completeSplitPair({ platformPercent: 100 })).toEqual({
      ok: true,
      pair: { platformPercent: 100, supplierSplitPercent: 0 },
    })
    expect(completeSplitPair({ platformPercent: 0 })).toEqual({
      ok: true,
      pair: { platformPercent: 0, supplierSplitPercent: 100 },
    })
  })

  it('keeps the documented total', () => {
    expect(SPLIT_TOTAL).toBe(100)
  })
})

describe('deriveDiscountPercent', () => {
  it('reports the saving the two prices imply', () => {
    expect(deriveDiscountPercent(100, 10)).toBe(90)
    expect(deriveDiscountPercent(249.9, 99)).toBe(60.38)
    expect(deriveDiscountPercent(50, 50)).toBe(0)
  })

  it('returns null rather than a negative badge when the coupon exceeds the price', () => {
    expect(deriveDiscountPercent(100, 120)).toBeNull()
  })

  it('returns null when either price is missing', () => {
    expect(deriveDiscountPercent(null, 10)).toBeNull()
    expect(deriveDiscountPercent(100, null)).toBeNull()
  })
})

describe('physicalOnSiteChargeIls', () => {
  it('reduces the sticker price by the discount', () => {
    expect(physicalOnSiteChargeIls(200, 25)).toBe(150)
    expect(physicalOnSiteChargeIls(99.9, 10)).toBe(89.91)
  })

  it('charges the full price when no discount is set', () => {
    expect(physicalOnSiteChargeIls(200, null)).toBe(200)
    expect(physicalOnSiteChargeIls(200, 0)).toBe(200)
  })
})

describe('splitOnSiteCharge', () => {
  it('gives the supplier the residual so nothing is created or lost', () => {
    // 3333 agorot at 30% rounds the fee to 1000; the residual is 2333. Applying
    // 70% independently would give 2333 as well here, but see the next case.
    const result = splitOnSiteCharge(agorot(3333), 30)
    expect(result.platformFee).toBe(1000)
    expect(result.supplierDue).toBe(2333)
    expect(result.platformFee + result.supplierDue).toBe(3333)
  })

  it('conserves the base at every percent, including the awkward ones', () => {
    for (const base of [1, 7, 99, 333, 1001, 12345, 999999]) {
      for (const percent of [0, 0.01, 1, 15, 33.33, 50, 66.67, 85, 99.99, 100]) {
        const result = splitOnSiteCharge(agorot(base), percent)
        expect(result.platformFee + result.supplierDue).toBe(base)
        expect(result.platformFee).toBeGreaterThanOrEqual(0)
        expect(result.supplierDue).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('hands everything to the platform at 100 and nothing at 0', () => {
    expect(splitOnSiteCharge(agorot(5000), 100)).toMatchObject({
      platformFee: 5000,
      supplierDue: 0,
    })
    expect(splitOnSiteCharge(agorot(5000), 0)).toMatchObject({
      platformFee: 0,
      supplierDue: 5000,
    })
  })
})

describe('missingSupplierDetails', () => {
  it('passes a fully filled supplier', () => {
    expect(missingSupplierDetails(completeSupplier)).toEqual([])
  })

  it('demands a supplier at all', () => {
    expect(missingSupplierDetails(null)).toEqual([
      { field: 'supplier_id', message: 'חייב לשייך ספק למוצר' },
    ])
  })

  // The shape of all eleven live suppliers when this was written.
  it('names every missing detail at once', () => {
    const blockers = missingSupplierDetails({
      id: completeSupplier.id,
      name: 'ספא רוגע',
      phone: '04-9999999',
      address: '   ',
      logoUrl: null,
      status: 'active',
    })
    expect(blockers.map((b) => b.field)).toEqual(['supplier_address', 'supplier_logo_url'])
  })
})

describe('assertPublishable', () => {
  const couponBase = {
    type: 'coupon' as const,
    priceIls: 100,
    platformPercent: 30,
    supplierSplitPercent: 70,
    discountPercent: 90,
    couponPriceIls: 10,
    couponExpiryDays: 120,
    supplier: completeSupplier,
  }

  it('publishes a complete coupon', () => {
    const result = assertPublishable(couponBase)
    expect(result).toEqual({ ok: true, pair: { platformPercent: 30, supplierSplitPercent: 70 } })
  })

  it('publishes a complete physical product without coupon fields', () => {
    const result = assertPublishable({
      type: 'physical',
      priceIls: 500,
      platformPercent: 15,
      supplierSplitPercent: 85,
      discountPercent: 10,
      couponPriceIls: null,
      couponExpiryDays: null,
      supplier: completeSupplier,
    })
    expect(result.ok).toBe(true)
  })

  it('blocks a coupon with no coupon price', () => {
    const result = assertPublishable({ ...couponBase, couponPriceIls: null })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.blockers.map((b) => b.field)).toContain('coupon_price_ils')
  })

  it('blocks a coupon priced above the sticker price', () => {
    const result = assertPublishable({ ...couponBase, couponPriceIls: 150 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.blockers[0]?.message).toContain('לא יכול לעלות')
  })

  it('blocks a physical product with no split', () => {
    const result = assertPublishable({
      type: 'physical',
      priceIls: 500,
      platformPercent: null,
      supplierSplitPercent: null,
      discountPercent: 0,
      couponPriceIls: null,
      couponExpiryDays: null,
      supplier: completeSupplier,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.blockers.map((b) => b.field)).toContain('platform_percent')
  })

  it('blocks any product with no discount percent', () => {
    const result = assertPublishable({ ...couponBase, discountPercent: null })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.blockers.map((b) => b.field)).toContain('discount_percent')
  })

  it('blocks a coupon with no expiry', () => {
    const result = assertPublishable({ ...couponBase, couponExpiryDays: null })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.blockers.map((b) => b.field)).toContain('coupon_expiry_days')
  })

  it('demands supplier details on a coupon and on a physical alike', () => {
    const bare = { id: completeSupplier.id, status: 'active' }
    for (const type of ['coupon', 'physical'] as const) {
      const result = assertPublishable({ ...couponBase, type, supplier: bare })
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.blockers.map((b) => b.field)).toEqual(
        expect.arrayContaining([
          'supplier_name',
          'supplier_phone',
          'supplier_address',
          'supplier_logo_url',
        ]),
      )
    }
  })

  it('blocks publication under a suspended supplier', () => {
    const result = assertPublishable({
      ...couponBase,
      supplier: { ...completeSupplier, status: 'suspended' },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.blockers.map((b) => b.field)).toContain('supplier_status')
  })

  // The admin should not have to submit six times to find six problems.
  it('reports every failing reason at once', () => {
    const result = assertPublishable({
      type: 'coupon',
      priceIls: null,
      platformPercent: null,
      supplierSplitPercent: null,
      discountPercent: null,
      couponPriceIls: null,
      couponExpiryDays: null,
      supplier: null,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.blockers.map((b) => b.field)).toEqual([
      'price_ils',
      'platform_percent',
      'discount_percent',
      'coupon_price_ils',
      'coupon_expiry_days',
      'supplier_id',
    ])
  })
})

describe('buildOrderItemSnapshot', () => {
  it('copies all eight values, not references', () => {
    const snapshot = buildOrderItemSnapshot({
      type: 'coupon',
      platformPercent: 30,
      supplierSplitPercent: 70,
      discountPercent: 90,
      couponPriceIls: 10,
      supplier: completeSupplier,
    })
    expect(snapshot).toEqual({
      platform_percent: 30,
      supplier_split_percent: 70,
      discount_percent: 90,
      coupon_price_ils: 10,
      supplier_name: 'מסעדת השף הגדול',
      supplier_phone: '03-1234567',
      supplier_address: 'דיזנגוף 100, תל אביב',
      supplier_logo_url: 'https://cdn.example.com/logo.png',
    })
  })

  // The point of a snapshot: mutating the source afterwards must not move it.
  it('is unaffected by later edits to the supplier object', () => {
    const supplier = { ...completeSupplier }
    const snapshot = buildOrderItemSnapshot({
      type: 'physical',
      platformPercent: 15,
      supplierSplitPercent: 85,
      discountPercent: 5,
      couponPriceIls: null,
      supplier,
    })
    supplier.name = 'שם חדש לגמרי'
    supplier.address = 'כתובת אחרת'
    expect(snapshot.supplier_name).toBe('מסעדת השף הגדול')
    expect(snapshot.supplier_address).toBe('דיזנגוף 100, תל אביב')
  })

  it('drops the coupon price on a physical line', () => {
    const snapshot = buildOrderItemSnapshot({
      type: 'physical',
      platformPercent: 15,
      supplierSplitPercent: 85,
      discountPercent: 5,
      couponPriceIls: 10,
      supplier: completeSupplier,
    })
    expect(snapshot.coupon_price_ils).toBeNull()
  })

  it('completes the pair from whichever half the product carries', () => {
    const snapshot = buildOrderItemSnapshot({
      type: 'physical',
      platformPercent: null,
      supplierSplitPercent: 85,
      discountPercent: null,
      couponPriceIls: null,
      supplier: completeSupplier,
    })
    expect(snapshot.platform_percent).toBe(15)
    expect(snapshot.supplier_split_percent).toBe(85)
  })

  // Writing 100/0 to paper over a missing split would hand the supplier's money
  // to the platform with no record of the decision.
  it('throws rather than snapshot a constant when the split is missing', () => {
    expect(() =>
      buildOrderItemSnapshot({
        type: 'coupon',
        platformPercent: null,
        supplierSplitPercent: null,
        discountPercent: 90,
        couponPriceIls: 10,
        supplier: completeSupplier,
      }),
    ).toThrow(/split pair/)
  })

  it('normalizes blank supplier details to null', () => {
    const snapshot = buildOrderItemSnapshot({
      type: 'physical',
      platformPercent: 20,
      supplierSplitPercent: 80,
      discountPercent: 0,
      couponPriceIls: null,
      supplier: { id: 'x', name: '  ', phone: '', address: null, logoUrl: undefined },
    })
    expect(snapshot.supplier_name).toBeNull()
    expect(snapshot.supplier_phone).toBeNull()
    expect(snapshot.supplier_address).toBeNull()
    expect(snapshot.supplier_logo_url).toBeNull()
  })
})

describe('previewProductMoney', () => {
  // The groo-style deal: 100 shekel of value, 10 paid here, 90 at the counter.
  it('shows a coupon paying part here and the rest at the business', () => {
    expect(
      previewProductMoney({
        type: 'coupon',
        priceIls: 100,
        platformPercent: 30,
        couponPriceIls: 10,
      }),
    ).toEqual({
      paidOnlineIls: 10,
      balanceAtBusinessIls: 90,
      platformKeepsIls: 3,
      supplierGetsIls: 7,
      discountPercent: 90,
    })
  })

  // Under the abolished rule this line would have shown the platform keeping all
  // 10 and the supplier nothing. The percent is what decides it now.
  it('splits the coupon prepayment by the product percent, not by a constant', () => {
    const platformKeepsAll = previewProductMoney({
      type: 'coupon',
      priceIls: 100,
      platformPercent: 100,
      couponPriceIls: 10,
    })
    expect(platformKeepsAll.platformKeepsIls).toBe(10)
    expect(platformKeepsAll.supplierGetsIls).toBe(0)

    const supplierKeepsMost = previewProductMoney({
      type: 'coupon',
      priceIls: 100,
      platformPercent: 15,
      couponPriceIls: 10,
    })
    expect(supplierKeepsMost.platformKeepsIls).toBe(1.5)
    expect(supplierKeepsMost.supplierGetsIls).toBe(8.5)
  })

  it('shows a physical product charging the discounted price in full', () => {
    expect(
      previewProductMoney({
        type: 'physical',
        priceIls: 200,
        platformPercent: 15,
        discountPercent: 25,
      }),
    ).toEqual({
      paidOnlineIls: 150,
      balanceAtBusinessIls: 0,
      platformKeepsIls: 22.5,
      supplierGetsIls: 127.5,
      discountPercent: 25,
    })
  })

  it('never lets the two shares drift from what the customer paid', () => {
    for (const couponPriceIls of [0.01, 1, 9.99, 33.33, 100]) {
      for (const platformPercent of [0, 7.5, 33.33, 50, 85, 100]) {
        const preview = previewProductMoney({
          type: 'coupon',
          priceIls: 200,
          platformPercent,
          couponPriceIls,
        })
        expect(preview.platformKeepsIls + preview.supplierGetsIls).toBeCloseTo(
          preview.paidOnlineIls,
          2,
        )
      }
    }
  })
})
