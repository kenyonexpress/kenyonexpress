import { describe, expect, it } from 'vitest'
import {
  buildCashbackCreditedEmail,
  buildCouponDeliveryEmail,
  buildGiftEmail,
  buildOrderConfirmationEmail,
  buildPasswordResetEmail,
  buildRefundCompletedEmail,
  buildSecurityAlertEmail,
  buildVoucherExpiryEmail,
  buildWelcomeEmail,
} from './index'

/**
 * The typed template entry points, checked as a set.
 *
 * WHAT THIS COVERS THAT `notifications.test.ts` DOES NOT. That file tests the
 * builders, which take a frozen `Record<string, unknown>` out of the outbox.
 * These modules are the OTHER caller: application code holding real values.
 * The failure they exist to prevent is a field renamed on one side of the
 * wrapper and not the other, which type-checks perfectly - `order_ref` and
 * `orderRef` are both just keys on a Record to the compiler - and arrives as a
 * silently empty line in a customer's inbox.
 *
 * So every assertion here goes through the wrapper and looks for a value that
 * could only be there if the mapping is right.
 */

const SITE = 'https://kenyonexpress.co.il'

describe('every template renders RTL Hebrew with inline styles', () => {
  const built = [
    [
      'order confirmation',
      buildOrderConfirmationEmail({ orderId: 'a'.repeat(36), totalAgorot: 12900, siteUrl: SITE }),
    ],
    ['welcome', buildWelcomeEmail({ fullName: 'דנה', siteUrl: SITE })],
    ['refund', buildRefundCompletedEmail({ refundedAgorot: 9900, siteUrl: SITE })],
    ['cashback', buildCashbackCreditedEmail({ amountAgorot: 500, siteUrl: SITE })],
  ] as const

  it.each(built)('%s sets dir=rtl on the body', (_label, email) => {
    expect(email).not.toBeNull()
    expect(email?.html).toContain('dir="rtl"')
  })

  it.each(built)('%s carries a Hebrew subject', (_label, email) => {
    expect(email?.subject).toMatch(/[א-ת]/)
  })

  it.each(built)('%s ships a plain-text alternative, not just HTML', (_label, email) => {
    // A mail with no text part is scored as spam by several providers and is
    // unreadable in a text-only client.
    expect(email?.text.trim().length ?? 0).toBeGreaterThan(20)
  })

  it.each(built)('%s inlines its styles, because mail clients drop <style>', (_label, email) => {
    expect(email?.html).toContain('style="')
    expect(email?.html).not.toContain('<style')
  })
})

describe('order confirmation template', () => {
  it('names the seller and its registration number in both bodies', () => {
    const email = buildOrderConfirmationEmail({
      orderId: 'a'.repeat(36),
      totalAgorot: 12900,
      siteUrl: SITE,
    })
    expect(email?.html).toContain('קניון אקספרס, מספר עוסק 033798513')
    expect(email?.text).toContain('קניון אקספרס, מספר עוסק 033798513')
  })
})

describe('refund template', () => {
  it('maps the fee through, and only when one was taken', () => {
    const withFee = buildRefundCompletedEmail({
      refundedAgorot: 9000,
      cancellationFeeAgorot: 1000,
      siteUrl: SITE,
    })
    expect(withFee?.text).toContain('דמי ביטול')

    const noFee = buildRefundCompletedEmail({ refundedAgorot: 10000, siteUrl: SITE })
    // Printing "₪0" on a defect claim reads as though a fee nearly happened.
    expect(noFee?.text).not.toContain('דמי ביטול')
  })

  it('says the charge will not be taken at all on the cancel-only path', () => {
    const voided = buildRefundCompletedEmail({
      refundedAgorot: 5000,
      cancelOnly: true,
      siteUrl: SITE,
    })
    // Not "we credited your card": there is no debit for that credit to sit
    // beside, and a customer told otherwise goes looking for a line that will
    // never appear on the statement.
    expect(voided?.text).toContain('לא ייגבה')
    expect(voided?.text).not.toContain('זיכינו את הכרטיס')
  })

  it('carries the order reference into the sentence', () => {
    const email = buildRefundCompletedEmail({
      refundedAgorot: 5000,
      orderRef: 'KE-1234',
      siteUrl: SITE,
    })
    expect(email?.text).toContain('KE-1234')
  })

  it('promises no date, because the issuer decides when the money lands', () => {
    const email = buildRefundCompletedEmail({ refundedAgorot: 5000, siteUrl: SITE })
    expect(email?.text).not.toMatch(/\d+\s*(ימי עסקים|ימים|שעות)/)
  })

  it('returns null rather than announcing a refund of nothing', () => {
    expect(buildRefundCompletedEmail({ refundedAgorot: 0, siteUrl: SITE })).toBeNull()
    expect(buildRefundCompletedEmail({ refundedAgorot: -100, siteUrl: SITE })).toBeNull()
  })
})

describe('welcome template', () => {
  it('greets by name when there is one', () => {
    expect(buildWelcomeEmail({ fullName: 'דנה', siteUrl: SITE })?.text).toContain('שלום דנה')
  })

  it('falls back to a bare greeting rather than greeting an empty string', () => {
    for (const input of [{ siteUrl: SITE }, { fullName: null, siteUrl: SITE }]) {
      const text = buildWelcomeEmail(input)?.text ?? ''
      expect(text).toContain('שלום,')
      expect(text).not.toMatch(/שלום\s+,/)
    }
  })

  it('makes no offer and carries no coupon code', () => {
    // The same sender address has to carry voucher codes and refund
    // confirmations later; opening with a discount files it under marketing.
    const email = buildWelcomeEmail({ siteUrl: SITE })
    expect(email?.text).not.toMatch(/הנחה|קופון מתנה|%|₪/)
  })

  it('links into the account area on the real origin', () => {
    const email = buildWelcomeEmail({ siteUrl: `${SITE}/` })
    // Trailing slash trimmed by the builder: a doubled slash in a mail link is
    // the kind of thing that survives review and 404s in an inbox.
    expect(email?.text).toContain(`${SITE}/account/coupons`)
    expect(email?.text).not.toContain('//account')
  })
})

describe('coupon delivery template', () => {
  /**
   * `coupon-delivery.ts` is a re-export of `buildVoucherEmail` under the
   * canonical templates/ name rather than a second copy of the HTML, so this
   * checks the alias resolves and renders - not the voucher email itself,
   * which `../voucher-email.test.ts` already covers in depth.
   */
  it('renders the coupon through the canonical name', () => {
    const email = buildCouponDeliveryEmail({
      customerName: 'דנה',
      orderId: 'b'.repeat(36),
      siteUrl: SITE,
      vouchers: [
        {
          id: 'v1',
          code: 'ABCD1234',
          productName: 'עיסוי שוודי',
          supplierName: 'ספא הרצליה',
          supplierAddress: null,
          supplierPhone: null,
          faceValueAgorot: 30000,
          couponPriceAgorot: 12000,
          remainingDueAgorot: 18000,
          expiresAt: '2027-01-01',
        },
      ],
    })
    expect(email.html).toContain('עיסוי שוודי')
    expect(email.html).toContain('dir="rtl"')
  })
})

describe('gift, expiry and account-security templates', () => {
  it('gift maps the claim token into the link and keeps it out of the subject', () => {
    const e = buildGiftEmail({
      productName: 'ארוחה זוגית',
      senderName: 'דנה',
      claimToken: 'tok123',
      siteUrl: SITE,
    })
    expect(e.html).toContain(`${SITE}/gift/tok123`)
    expect(e.text).toContain('ארוחה זוגית')
    expect(e.subject).not.toContain('tok123')
  })

  it('expiry renders the day count and refuses to render without a deadline', () => {
    const e = buildVoucherExpiryEmail({ daysRemaining: 7, productName: 'ספא', siteUrl: SITE })
    expect(e?.subject).toContain('7')
    expect(buildVoucherExpiryEmail({ daysRemaining: 0, siteUrl: SITE })).toBeNull()
  })

  it('password reset carries the link and rejects a non-https link', () => {
    const url = 'https://kenyonexpress.co.il/auth/reset?t=abc'
    const e = buildPasswordResetEmail({ resetUrl: url, validMinutes: 30 })
    expect(e?.text).toContain(url)
    expect(e?.html).toContain('dir="rtl"')
    expect(e?.text).toContain('30')
    expect(buildPasswordResetEmail({ resetUrl: 'http://x.test/r' })).toBeNull()
    expect(buildPasswordResetEmail({ resetUrl: 'javascript:alert(1)' })).toBeNull()
  })

  it('security alert names the event and carries no IP or token', () => {
    const e = buildSecurityAlertEmail({
      event: 'password_changed',
      occurredAt: '2026-10-01T10:00:00Z',
      siteUrl: SITE,
    })
    expect(e.subject).toMatch(/[א-ת]/)
    expect(e.html).toContain('dir="rtl"')
    expect(e.text).toContain(`${SITE}/account/security`)
    expect(e.text).not.toMatch(/\d+\.\d+\.\d+\.\d+/)
  })

  it('escapes user-supplied names', () => {
    const e = buildPasswordResetEmail({
      fullName: '<script>x</script>',
      resetUrl: 'https://kenyonexpress.co.il/r',
    })
    expect(e?.html).not.toContain('<script>')
  })
})
