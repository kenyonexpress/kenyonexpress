import { buildCouponOffer } from '@/lib/commerce/coupon-offer'
import { describe, expect, it } from 'vitest'
import { buildSmallPrint } from './small-print'

const ids = (lines: ReturnType<typeof buildSmallPrint>) => lines.map((l) => l.id)

describe('buildSmallPrint', () => {
  const physical = {
    productType: 'physical' as const,
    couponOffer: null,
    vatExempt: null,
    requiresShipping: true,
    warrantyMonths: 12,
    originalPriceSource: null,
  }

  it('gives a physical product VAT, shipping, warranty, stock, cancellation and images', () => {
    const lines = buildSmallPrint(physical)
    expect(ids(lines)).toEqual(['vat', 'shipping', 'warranty', 'stock', 'cancellation', 'images'])
    expect(lines.find((l) => l.id === 'warranty')?.text).toContain('12')
    expect(lines.find((l) => l.id === 'vat')?.text).toContain('מע"מ')
  })

  it('drops the shipping line for a product that ships nowhere, and the warranty when there is none', () => {
    const lines = buildSmallPrint({ ...physical, requiresShipping: false, warrantyMonths: null })
    expect(ids(lines)).toEqual(['vat', 'stock', 'cancellation', 'images'])
  })

  it('says a VAT-exempt product is exempt rather than claiming VAT is included', () => {
    const [vat] = buildSmallPrint({ ...physical, vatExempt: true })
    expect(vat?.text).toContain('פטור')
    const [incl] = buildSmallPrint({ ...physical, vatExempt: false })
    expect(incl?.text).not.toContain('פטור')
  })

  it('links the cancellation line to the returns clause and never restates the terms', () => {
    const cancel = buildSmallPrint(physical).find((l) => l.id === 'cancellation')
    expect(cancel?.link).toEqual({
      href: '/refund_returns#how-to-cancel',
      label: expect.any(String),
      external: false,
    })
    // The 14-day window and the fee cap are pinned by legal-pages.test.ts on
    // the document itself; a copy here would be a second legal text.
    expect(cancel?.text).not.toMatch(/14|5%|100/)
  })

  it('states the basis of the struck price, with a link only when there is one', () => {
    const withLink = buildSmallPrint({
      ...physical,
      originalPriceSource: { label: 'מחירון היצרן', href: 'https://example.co.il/list' },
    })
    const basis = withLink.find((l) => l.id === 'price-basis')
    expect(basis?.text).toContain('מחירון היצרן')
    expect(basis?.link).toEqual({
      href: 'https://example.co.il/list',
      label: expect.any(String),
      external: true,
    })

    const noLink = buildSmallPrint({
      ...physical,
      originalPriceSource: { label: 'מחיר קודם בחנות', href: null },
    })
    expect(noLink.find((l) => l.id === 'price-basis')?.link).toBeUndefined()
  })

  it('gives a sellable coupon its validity in both forms, single use and the balance', () => {
    const offer = buildCouponOffer({
      fullPriceIls: 200,
      couponPriceIls: 80,
      validUntil: '2026-12-15T10:00:00.000Z',
      expiryDays: 90,
      now: new Date('2026-09-25T00:00:00.000Z'),
    })
    const lines = buildSmallPrint({
      productType: 'coupon',
      couponOffer: offer,
      vatExempt: null,
      requiresShipping: null,
      warrantyMonths: null,
      originalPriceSource: null,
    })
    expect(ids(lines)).toEqual([
      'vat',
      'coupon-valid-days',
      'offer-valid-until',
      'coupon-single-use',
      'coupon-balance',
      'cancellation',
      'images',
    ])
    expect(lines.find((l) => l.id === 'coupon-valid-days')?.text).toContain('90')
    // The site's long date form, through the shared formatter.
    expect(lines.find((l) => l.id === 'offer-valid-until')?.text).toContain('2026')
  })

  it('states no forward validity for a closed offer, and no balance when nothing is due', () => {
    const expired = buildCouponOffer({
      fullPriceIls: 200,
      couponPriceIls: 80,
      validUntil: '2026-01-01T00:00:00.000Z',
      expiryDays: 90,
      now: new Date('2026-09-25T00:00:00.000Z'),
    })
    expect(expired.sellable).toBe(false)
    const lines = buildSmallPrint({
      productType: 'coupon',
      couponOffer: expired,
      vatExempt: null,
      requiresShipping: null,
      warrantyMonths: null,
      originalPriceSource: null,
    })
    expect(ids(lines)).not.toContain('coupon-valid-days')
    expect(ids(lines)).not.toContain('coupon-balance')
    expect(ids(lines)).toContain('coupon-single-use')

    const fullyPaid = buildCouponOffer({
      fullPriceIls: 80,
      couponPriceIls: 80,
      validUntil: null,
      expiryDays: null,
      now: new Date('2026-09-25T00:00:00.000Z'),
    })
    const paid = buildSmallPrint({
      productType: 'coupon',
      couponOffer: fullyPaid,
      vatExempt: null,
      requiresShipping: null,
      warrantyMonths: null,
      originalPriceSource: null,
    })
    expect(ids(paid)).toEqual(['vat', 'coupon-single-use', 'cancellation', 'images'])
  })

  it('tells a subscriber the renewal is automatic', () => {
    const lines = buildSmallPrint({ ...physical, productType: 'recurring' })
    expect(ids(lines)).toEqual(['vat', 'recurring', 'cancellation', 'images'])
  })

  it('leaves no placeholder unfilled in any line', () => {
    const offer = buildCouponOffer({
      fullPriceIls: 200,
      couponPriceIls: 80,
      validUntil: '2026-12-15T10:00:00.000Z',
      expiryDays: 30,
      now: new Date('2026-09-25T00:00:00.000Z'),
    })
    for (const line of [
      ...buildSmallPrint({ ...physical, originalPriceSource: { label: 'מחירון', href: null } }),
      ...buildSmallPrint({ ...physical, productType: 'coupon', couponOffer: offer }),
    ]) {
      expect(line.text, line.id).not.toMatch(/\{[a-z]+\}/i)
    }
  })
})
