import { describe, expect, it } from 'vitest'
import { SEGMENT_CEILING, SMS_KINDS, type SmsKind, buildSmsMessage } from './templates'

/**
 * The copy, and the budget it is written against.
 *
 * The segment ceiling is the assertion that earns its place: a template that
 * grows by one word and crosses 70 or 134 characters costs 50% more per send,
 * forever, and nothing about the message looks different.
 */

const PAYLOADS: Record<SmsKind, Record<string, unknown>> = {
  voucher_issued: { code: 'ABCD-1234', product_name: 'עיסוי זוגי' },
  voucher_expiring: { days_remaining: 1, product_name: 'עיסוי זוגי' },
  order_shipped: { carrier: 'דואר ישראל', order_ref: 'ORDER1' },
  refund_completed: { refunded_agorot: 12_500 },
  otp: { code: '482913' },
}

describe('every template stays inside its budget', () => {
  it.each(SMS_KINDS)('%s', (kind) => {
    const built = buildSmsMessage(kind, PAYLOADS[kind])
    expect(built, `${kind} rendered nothing from its own fixture`).not.toBeNull()
    expect(built?.segments, `${kind} body: ${built?.body}`).toBeLessThanOrEqual(
      SEGMENT_CEILING[kind],
    )
  })

  it('has a ceiling for every kind and no others', () => {
    expect(Object.keys(SEGMENT_CEILING).sort()).toEqual([...SMS_KINDS].sort())
  })
})

describe('what refuses to render', () => {
  it('sends no SMS for a kind that owes none', () => {
    // The gate. The outbox carries supplier and admin alerts and none of them
    // belong on a customer's phone bill.
    for (const kind of ['supplier_sale', 'reconciliation_gap', 'welcome', 'settlement_gap']) {
      expect(buildSmsMessage(kind, {})).toBeNull()
    }
  })

  it('refuses a coupon with no code, which is the only thing worth sending', () => {
    expect(buildSmsMessage('voucher_issued', { product_name: 'עיסוי' })).toBeNull()
  })

  it('refuses an expiry reminder that is not T-1', () => {
    // A reminder seven days out is a marketing message wearing a transactional
    // badge, and it is the kind of send that gets a sender ID reported.
    expect(buildSmsMessage('voucher_expiring', { days_remaining: 7 })).toBeNull()
    expect(buildSmsMessage('voucher_expiring', { days_remaining: 2 })).toBeNull()
    expect(buildSmsMessage('voucher_expiring', { days_remaining: 1 })).not.toBeNull()
    expect(buildSmsMessage('voucher_expiring', { days_remaining: 0 })).not.toBeNull()
  })

  it('refuses a refund of nothing', () => {
    expect(buildSmsMessage('refund_completed', { refunded_agorot: 0 })).toBeNull()
    expect(buildSmsMessage('refund_completed', {})).toBeNull()
  })

  it('refuses an OTP that is not a plain numeric code', () => {
    // Anything else in an OTP body is either a bug or an injection into a
    // message the customer is primed to trust.
    for (const code of ['12', '123456789', 'ABC123', '12 34', '', '12345\nו']) {
      expect(buildSmsMessage('otp', { code }), code).toBeNull()
    }
    expect(buildSmsMessage('otp', { code: '482913' })).not.toBeNull()
  })
})

describe('what the bodies must and must not contain', () => {
  it('puts the coupon code IN the body, isolated', () => {
    // The one thing SMS is better at than every other channel: a customer at a
    // counter with no data connection can read it. A link would defeat that.
    const built = buildSmsMessage('voucher_issued', PAYLOADS.voucher_issued)
    expect(built?.body).toContain('ABCD-1234')
    // U+2068 FIRST STRONG ISOLATE ... U+2069 POP. Without it an LTR code in an
    // RTL sentence renders in a plausible but wrong order, and the customer
    // finds out at a till with a queue behind them.
    expect(built?.body).toContain('⁨ABCD-1234⁩')
  })

  it('never carries a URL', () => {
    // Long, unclickable in some Israeli carriers' clients, and the exact shape
    // of every smishing message the customer has already received.
    for (const kind of SMS_KINDS) {
      expect(buildSmsMessage(kind, PAYLOADS[kind])?.body, kind).not.toMatch(/https?:\/\//)
    }
  })

  it('keeps the tracking number out of the shipping message', () => {
    // A long LTR number inside RTL text renders wrong, and a wrong tracking
    // number is worse than none: the customer types it into a courier's site
    // and is told it does not exist.
    const built = buildSmsMessage('order_shipped', {
      carrier: 'דואר ישראל',
      tracking_number: 'RR123456789IL',
    })
    expect(built?.body).not.toContain('RR123456789IL')
    expect(built?.body).toContain('דואר ישראל')
  })

  it('warns against forwarding the OTP', () => {
    // The entire attack on SMS OTP is a phone call saying "read me the code we
    // just sent". The warning is the cheapest countermeasure there is.
    expect(buildSmsMessage('otp', { code: '482913' })?.body).toContain('אל תעבירו')
  })

  it('names no date in the refund message', () => {
    // Cardcom credits the card; when it appears is the issuer's business. A
    // message that names a day generates a support ticket on that day.
    const body = buildSmsMessage('refund_completed', { refunded_agorot: 12_500 })?.body ?? ''
    expect(body).toContain('₪125')
    expect(body).not.toMatch(/\d+\s*(ימים|ימי עסקים|שעות)/)
  })

  it('drops a .00 that only costs characters', () => {
    expect(buildSmsMessage('refund_completed', { refunded_agorot: 12_500 })?.body).toContain('₪125')
    expect(buildSmsMessage('refund_completed', { refunded_agorot: 12_550 })?.body).toContain(
      '₪125.50',
    )
  })
})
