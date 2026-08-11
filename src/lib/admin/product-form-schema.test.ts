import { type ProductInput, productSchema } from '@/lib/admin/product-form-schema'
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

  it('never defaults platform_percent when it is missing', () => {
    // C1: the percent is the only split handle and has no default anywhere.
    const result = productSchema.safeParse({ ...base(), platform_percent: undefined })
    expect(result.success).toBe(false)
  })
})

/**
 * Geo. `products.city` landed with migration 113 on 2026-08-10 and every one of
 * the 80 rows is still NULL, so the storefront's city filter and "קרוב אליי"
 * have only ever had `suppliers.city` to read, which is filled for 5 of 11
 * suppliers. This field is what finally fills the product's own.
 *
 * It is a closed list rather than free text because distance resolves through
 * the CITIES table: an unrecognised name would save without error, match no
 * city, and drop the product out of both the filter and near-me with nothing
 * anywhere reporting it. That silence is the whole reason for the refinement.
 */
describe('productSchema: city', () => {
  it('accepts a city the geo table knows', () => {
    const result = productSchema.safeParse(base({ city: 'תל אביב' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.city).toBe('תל אביב')
  })

  it('refuses a city the geo table does not know', () => {
    expect(errorsAt(base({ city: 'ת"א' }), 'city')).toContain('עיר לא מוכרת')
    expect(errorsAt(base({ city: 'Tel Aviv' }), 'city')).toContain('עיר לא מוכרת')
  })

  it('treats the empty selection as no city rather than an invalid one', () => {
    const result = productSchema.safeParse(base({ city: '' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.city).toBeNull()
  })

  it('stays optional, so every existing product still validates', () => {
    // All 80 live rows have city NULL. A required field here would have made
    // every one of them unsaveable through the form.
    expect(productSchema.safeParse(base()).success).toBe(true)
  })
})
