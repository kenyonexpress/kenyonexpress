import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRODUCT_TERMS,
  MAX_SUPPLIER_TRANSFER_DAYS,
  STATUTORY_CANCELLATION_DAYS,
  isDefaultProductTerms,
  productTermsFromForm,
  productTermsWrite,
  readProductTerms,
} from './product-terms'

describe('readProductTerms', () => {
  it('reads a production row (none of the five columns) as the defaults', () => {
    // 243 is not applied. The form must open every existing product with the
    // statutory window and free shipping, not with empty boxes.
    expect(readProductTerms({ id: 'x', name_he: 'מוצר' })).toEqual(DEFAULT_PRODUCT_TERMS)
    expect(readProductTerms(null)).toEqual(DEFAULT_PRODUCT_TERMS)
  })

  it('reads stored terms back as stored', () => {
    expect(
      readProductTerms({
        shipping_price_agorot: 2990,
        supplier_transfer_days: 7,
        payout_cadence: 'weekly',
        cancellation_window_days: 30,
        refund_policy: 'fee_waived',
      }),
    ).toEqual({
      shippingPriceAgorot: 2990,
      supplierTransferDays: 7,
      payoutCadence: 'weekly',
      cancellationWindowDays: 30,
      refundPolicy: 'fee_waived',
    })
  })

  it('never reads a window below the statutory floor', () => {
    // A value the CHECK would refuse cannot be shown back as a stored choice.
    expect(readProductTerms({ cancellation_window_days: 7 }).cancellationWindowDays).toBe(
      STATUTORY_CANCELLATION_DAYS,
    )
    expect(readProductTerms({ cancellation_window_days: '30' }).cancellationWindowDays).toBe(30)
  })

  it('treats malformed values as absent', () => {
    const terms = readProductTerms({
      shipping_price_agorot: -1,
      supplier_transfer_days: MAX_SUPPLIER_TRANSFER_DAYS + 1,
      payout_cadence: 'hourly',
      refund_policy: 'whatever',
    })
    expect(terms).toEqual(DEFAULT_PRODUCT_TERMS)
  })
})

describe('productTermsFromForm', () => {
  it('converts the shipping price once, in agorot, and fills every blank with its default', () => {
    expect(productTermsFromForm({ shipping_price_ils: 29.9 })).toEqual({
      ...DEFAULT_PRODUCT_TERMS,
      shippingPriceAgorot: 2990,
    })
    expect(productTermsFromForm({})).toEqual(DEFAULT_PRODUCT_TERMS)
  })

  it('keeps a typed value distinct from its default for the ladder', () => {
    const typed = productTermsFromForm({ cancellation_window_days: 30 })
    expect(isDefaultProductTerms(typed)).toBe(false)
    expect(isDefaultProductTerms(productTermsFromForm({ shipping_price_ils: 0 }))).toBe(true)
    expect(isDefaultProductTerms(productTermsFromForm({ cancellation_window_days: 14 }))).toBe(true)
  })
})

describe('productTermsWrite', () => {
  it('names the five columns 243 declares', () => {
    expect(productTermsWrite(DEFAULT_PRODUCT_TERMS)).toEqual({
      shipping_price_agorot: 0,
      supplier_transfer_days: null,
      payout_cadence: null,
      cancellation_window_days: 14,
      refund_policy: 'statutory',
    })
  })
})
