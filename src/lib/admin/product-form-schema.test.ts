import {
  type ProductInput,
  originalPriceSourceConflict,
  productExtrasSchema,
  productSchema,
} from '@/lib/admin/product-form-schema'
import { describe, expect, it } from 'vitest'

/**
 * The three-mode product selector had no test of any kind. Its rules are not in
 * the field definitions but in the `superRefine` below them, which is precisely
 * the part that depends on which mode the admin picked, and precisely the part
 * a field-by-field reading of the schema does not show.
 *
 * Every refusal asserted here protects money or a customer promise:
 *   - a coupon with no validity period used to become a silent 90 days in
 *     finalize, a promise nobody made;
 *   - a coupon priced above the product price undercuts the split;
 *   - a subscription with no amount is unconfigured, not free;
 *   - a split pair that does not reach 100% means someone is unpaid.
 */

function base(overrides: Partial<Record<keyof ProductInput, unknown>> = {}) {
  return {
    slug: 'deal-1',
    name_he: 'מוצר בדיקה',
    type: 'physical',
    kenyon_price: 100,
    platform_percent: 10,
    status: 'draft',
    ...overrides,
  }
}

function errorsAt(input: Record<string, unknown>, path: string): string[] {
  const result = productSchema.safeParse(input)
  if (result.success) return []
  return result.error.issues.filter((i) => i.path.join('.') === path).map((i) => i.message)
}

describe('productSchema: the three modes', () => {
  it('accepts each mode the selector offers', () => {
    expect(productSchema.safeParse(base({ type: 'physical' })).success).toBe(true)
    expect(productSchema.safeParse(base({ type: 'coupon', coupon_expiry_days: 30 })).success).toBe(
      true,
    )
    expect(
      productSchema.safeParse(
        base({ type: 'recurring', recurring_amount_ils: 49, billing_interval: 'monthly' }),
      ).success,
    ).toBe(true)
  })

  it('rejects a mode the form does not offer', () => {
    // `service` is a live value of the DB enum that the admin deliberately does
    // not expose. The schema is the gate that keeps it unwritable from the form.
    expect(productSchema.safeParse(base({ type: 'service' })).success).toBe(false)
    expect(productSchema.safeParse(base({ type: 'subscription' })).success).toBe(false)
  })
})

describe('productSchema: coupon rules', () => {
  it('refuses a coupon with no validity period', () => {
    expect(errorsAt(base({ type: 'coupon' }), 'coupon_expiry_days')).toContain(
      'תוקף קופון בימים נדרש למוצר קופון',
    )
  })

  it('applies the same rule to a physical product opted into coupons', () => {
    // is_coupon_enabled sells a coupon off a physical product, so it inherits
    // the coupon obligations rather than the physical ones.
    expect(
      errorsAt(base({ type: 'physical', is_coupon_enabled: true }), 'coupon_expiry_days'),
    ).toHaveLength(1)
  })

  it('does not demand a validity period from a plain physical product', () => {
    expect(errorsAt(base({ type: 'physical' }), 'coupon_expiry_days')).toHaveLength(0)
  })

  it('refuses a coupon priced above the product price', () => {
    const errors = errorsAt(
      base({ type: 'coupon', coupon_expiry_days: 30, kenyon_price: 100, coupon_price_ils: 150 }),
      'coupon_price_ils',
    )
    expect(errors).toContain('מחיר הקופון לא יכול לעלות על המחיר הרגיל')
  })
})

describe('productSchema: recurring rules', () => {
  it('refuses a subscription with no amount', () => {
    expect(
      errorsAt(base({ type: 'recurring', billing_interval: 'monthly' }), 'recurring_amount_ils'),
    ).toContain('סכום החיוב התקופתי נדרש למוצר עם חיוב חודשי קבוע')
  })

  it('refuses a subscription with no interval', () => {
    expect(
      errorsAt(base({ type: 'recurring', recurring_amount_ils: 49 }), 'billing_interval'),
    ).toContain('תדירות חיוב נדרשת למוצר עם חיוב חודשי קבוע')
  })

  it('asks nothing recurring of the other two modes', () => {
    expect(errorsAt(base({ type: 'physical' }), 'recurring_amount_ils')).toHaveLength(0)
    expect(
      errorsAt(base({ type: 'coupon', coupon_expiry_days: 30 }), 'billing_interval'),
    ).toHaveLength(0)
  })
})

describe('productSchema: the split pair, in every mode', () => {
  it('refuses a pair that does not reach 100%', () => {
    const errors = errorsAt(
      base({ platform_percent: 10, supplier_split_percent: 80 }),
      'supplier_split_percent',
    )
    expect(errors[0]).toContain('90%')
  })

  it('accepts a pair that does', () => {
    expect(
      productSchema.safeParse(base({ platform_percent: 10, supplier_split_percent: 90 })).success,
    ).toBe(true)
  })

  it('allows a content draft without money fields, and does not invent a percent', () => {
    const result = productSchema.safeParse({
      slug: 'deal-1',
      name_he: 'מוצר בדיקה',
      type: 'physical',
      status: 'draft',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.platform_percent ?? null).toBeNull()
      expect(result.data.kenyon_price ?? null).toBeNull()
    }
  })

  it('treats an empty money field as null rather than zero', () => {
    const result = productSchema.safeParse(base({ platform_percent: '', kenyon_price: '' }))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.platform_percent ?? null).toBeNull()
      expect(result.data.kenyon_price ?? null).toBeNull()
    }
  })
})

describe('productSchema: stays closed to the Q05 extras', () => {
  it('sets none of the extras keys on its output', () => {
    // zod 3.25 SETS an absent preprocessed key as null. The CSV import spreads
    // this output into its insert, so any extras key here would send 242/243
    // columns (and `shipping_price_ils`, which is no column) with every
    // imported row. The extras live on productExtrasSchema, parsed by the
    // form action only.
    const result = productSchema.safeParse(base())
    expect(result.success).toBe(true)
    if (result.success) {
      for (const key of Object.keys(productExtrasSchema._def.schema.shape)) {
        expect(key in result.data, key).toBe(false)
      }
    }
  })
})

describe('productExtrasSchema', () => {
  it('parses an untouched form as all-null, never as a default', () => {
    const result = productExtrasSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Object.values(result.data).every((v) => v === null)).toBe(true)
    }
  })

  it('refuses a cancellation window under the statutory 14 days', () => {
    const result = productExtrasSchema.safeParse({ cancellation_window_days: 7 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('14')
    }
    expect(productExtrasSchema.safeParse({ cancellation_window_days: 14 }).success).toBe(true)
    expect(productExtrasSchema.safeParse({ cancellation_window_days: 30 }).success).toBe(true)
  })

  it('refuses a source link without a source label, and a non-https link', () => {
    const noLabel = productExtrasSchema.safeParse({
      original_price_source_url: 'https://example.com/list',
    })
    expect(noLabel.success).toBe(false)
    if (!noLabel.success) {
      expect(noLabel.error.issues[0]?.path).toEqual(['original_price_source'])
    }
    expect(
      productExtrasSchema.safeParse({
        original_price_source: 'מחירון היצרן',
        original_price_source_url: 'http://example.com/list',
      }).success,
    ).toBe(false)
    expect(
      productExtrasSchema.safeParse({
        original_price_source: 'מחירון היצרן',
        original_price_source_url: 'https://example.com/list',
      }).success,
    ).toBe(true)
  })

  it('bounds cashback to a percent and keeps shipping non-negative', () => {
    expect(productExtrasSchema.safeParse({ cashback_percent: 101 }).success).toBe(false)
    expect(productExtrasSchema.safeParse({ cashback_percent: -1 }).success).toBe(false)
    expect(productExtrasSchema.safeParse({ shipping_price_ils: -5 }).success).toBe(false)
    expect(productExtrasSchema.safeParse({ shipping_price_ils: '29.90' }).success).toBe(true)
  })

  it('accepts only the named cadences and policies', () => {
    expect(productExtrasSchema.safeParse({ payout_cadence: 'hourly' }).success).toBe(false)
    expect(productExtrasSchema.safeParse({ payout_cadence: 'weekly' }).success).toBe(true)
    expect(productExtrasSchema.safeParse({ refund_policy: 'none' }).success).toBe(false)
    expect(productExtrasSchema.safeParse({ refund_policy: 'fee_waived' }).success).toBe(true)
  })
})

describe('originalPriceSourceConflict', () => {
  it('refuses a source for a price that is not there', () => {
    expect(
      originalPriceSourceConflict({ full_price: null }, { original_price_source: 'מחירון' }),
    ).toContain('מחיר לפני הנחה')
    expect(
      originalPriceSourceConflict({ full_price: 120 }, { original_price_source: 'מחירון' }),
    ).toBeNull()
    expect(
      originalPriceSourceConflict({ full_price: null }, { original_price_source: null }),
    ).toBeNull()
  })
})
