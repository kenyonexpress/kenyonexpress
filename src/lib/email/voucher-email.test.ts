import { type VoucherEmailLine, buildVoucherEmail } from '@/lib/email/voucher-email'
import { describe, expect, it } from 'vitest'

/**
 * The email is the only part of the purchase the customer keeps. What it must
 * always carry: the code they can read aloud, the balance they will be asked
 * for at the counter, the deadline, and a link to the page that renders the QR.
 */

function line(overrides: Partial<VoucherEmailLine> = {}): VoucherEmailLine {
  return {
    id: '11111111-2222-4333-8444-555555555555',
    code: 'ABCDEFGHJK',
    productName: 'ארוחת בוקר זוגית',
    supplierName: 'טעמים גורמה',
    supplierAddress: 'דיזנגוף 12, תל אביב',
    supplierPhone: '03-1234567',
    faceValueAgorot: 20000,
    couponPriceAgorot: 2000,
    remainingDueAgorot: 18000,
    expiresAt: '2026-10-30T10:00:00.000Z',
    ...overrides,
  }
}

const BASE = {
  customerName: 'דנה כהן',
  orderId: 'd3a5aa99-ed75-4bf4-8dfa-ad0035be848c',
  siteUrl: 'https://kenyonexpress.co.il',
}

describe('buildVoucherEmail', () => {
  it('names the product in the subject for a single coupon', () => {
    const email = buildVoucherEmail({ ...BASE, vouchers: [line()] })
    expect(email.subject).toContain('ארוחת בוקר זוגית')
  })

  it('counts the coupons in the subject when there is more than one', () => {
    const email = buildVoucherEmail({
      ...BASE,
      vouchers: [line(), line({ id: 'b', code: 'KKKKKKKKKK' })],
    })
    expect(email.subject).toContain('2')
  })

  it('shows the code grouped, in both bodies', () => {
    const email = buildVoucherEmail({ ...BASE, vouchers: [line()] })
    expect(email.html).toContain('ABCDE-FGHJK')
    expect(email.text).toContain('ABCDE-FGHJK')
  })

  // The number the customer will be asked for at the counter. An email that
  // only says what they already paid sets up an argument at a till.
  it('states what is still owed at the business, not only what was paid', () => {
    const email = buildVoucherEmail({ ...BASE, vouchers: [line()] })
    expect(email.html).toContain('₪180.00')
    expect(email.html).toContain('₪20.00')
    expect(email.text).toContain('לתשלום בבית העסק: ₪180.00')
  })

  it('links to the coupon page for the QR', () => {
    const email = buildVoucherEmail({ ...BASE, vouchers: [line()] })
    const url = 'https://kenyonexpress.co.il/coupon/11111111-2222-4333-8444-555555555555'
    expect(email.html).toContain(url)
    expect(email.text).toContain(url)
  })

  // Gmail and most corporate filters strip data: URIs, so an embedded QR shows
  // as a broken image exactly where the coupon should be.
  it('embeds no image at all', () => {
    const email = buildVoucherEmail({ ...BASE, vouchers: [line()] })
    expect(email.html).not.toContain('data:image')
    expect(email.html).not.toContain('<img')
  })

  it('trims a trailing slash on the site url rather than producing a double one', () => {
    const email = buildVoucherEmail({
      ...BASE,
      siteUrl: 'https://kenyonexpress.co.il/',
      vouchers: [line()],
    })
    expect(email.html).not.toContain('.co.il//coupon')
  })

  it('carries the expiry date', () => {
    const email = buildVoucherEmail({ ...BASE, vouchers: [line()] })
    expect(email.text).toContain('בתוקף עד')
    expect(email.html).toContain('2026')
  })

  it('renders one block per coupon', () => {
    const email = buildVoucherEmail({
      ...BASE,
      vouchers: [line(), line({ id: 'second-id', code: 'ZZZZZZZZZZ', productName: 'עיסוי' })],
    })
    expect(email.html).toContain('ABCDE-FGHJK')
    expect(email.html).toContain('ZZZZZ-ZZZZZ')
    expect(email.html).toContain('עיסוי')
  })

  it('greets by name when there is one, and neutrally when there is not', () => {
    expect(buildVoucherEmail({ ...BASE, vouchers: [line()] }).text).toContain('שלום דנה כהן')
    expect(
      buildVoucherEmail({ ...BASE, customerName: null, vouchers: [line()] }).text.startsWith(
        'שלום,',
      ),
    ).toBe(true)
  })

  it('survives a coupon with no product or supplier details', () => {
    const email = buildVoucherEmail({
      ...BASE,
      vouchers: [
        line({ productName: null, supplierName: null, supplierAddress: null, supplierPhone: null }),
      ],
    })
    expect(email.html).toContain('קופון')
    expect(email.html).not.toContain('null')
  })

  // The product name is supplier-controlled text landing in an HTML document.
  it('escapes markup in a product or supplier name', () => {
    const email = buildVoucherEmail({
      ...BASE,
      vouchers: [line({ productName: '<script>alert(1)</script>' })],
    })
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('sets rtl on the elements themselves, since email clients ignore stylesheets', () => {
    const email = buildVoucherEmail({ ...BASE, vouchers: [line()] })
    expect(email.html).toContain('dir="rtl"')
    // The code itself reads left to right even inside an RTL document.
    expect(email.html).toContain('dir="ltr"')
  })

  it('shows the order reference', () => {
    const email = buildVoucherEmail({ ...BASE, vouchers: [line()] })
    expect(email.html).toContain('D3A5AA99')
  })
})
