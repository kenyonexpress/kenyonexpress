import { describe, expect, it } from 'vitest'
import { isOptOutExempt, optOutIntentOf } from './opt-out'

/**
 * THE KEYWORD TWILIO DOES NOT RECOGNISE.
 *
 * Twilio intercepts STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT and blocks
 * the number itself. Every one is English. An Israeli customer replies **הסר**,
 * which Twilio forwards as an ordinary inbound message and does nothing about.
 * A shop relying on the carrier's own handling has an opt-out that works for
 * the customers who would never have used it and fails for the ones who do.
 */

describe('the Hebrew keywords, which are the ones that matter here', () => {
  it.each(['הסר', 'הסרה', 'להסיר', 'הפסק', 'הפסיקו', 'בטל', 'ביטול'])(
    'reads %s as stop',
    (word) => {
      expect(optOutIntentOf(word)).toBe('stop')
    },
  )

  it.each(['הצטרף', 'הצטרפות', 'התחל', 'כן'])('reads %s as start', (word) => {
    expect(optOutIntentOf(word)).toBe('start')
  })
})

describe('the English keywords, matched again because Twilio’s block does not travel', () => {
  it.each(['STOP', 'stop', 'StopAll', 'UNSUBSCRIBE', 'cancel', 'END', 'quit'])(
    'reads %s as stop',
    (word) => {
      expect(optOutIntentOf(word)).toBe('stop')
    },
  )

  it('is per (customer, sender) at Twilio and per customer here', () => {
    // Twilio's block does not follow a change of sending number. This list is
    // ours and moves with us, which is why it is duplicated rather than
    // delegated.
    expect(optOutIntentOf('START')).toBe('start')
  })
})

describe('what is NOT an opt-out', () => {
  it('does not match a keyword inside a sentence', () => {
    // The failure this guards: a customer asking a question that happens to
    // contain the word would be silently unsubscribed and never learn why.
    expect(optOutIntentOf('מתי אפשר להסיר את המדבקה מהקופון')).toBeNull()
    expect(optOutIntentOf('please stop sending me two of these')).toBeNull()
  })

  it('is null for an ordinary message, an empty body and nothing at all', () => {
    expect(optOutIntentOf('היי, אפשר לעזור לי עם ההזמנה?')).toBeNull()
    expect(optOutIntentOf('')).toBeNull()
    expect(optOutIntentOf('   ')).toBeNull()
    expect(optOutIntentOf(null)).toBeNull()
    expect(optOutIntentOf(undefined)).toBeNull()
  })
})

describe('the forms a real keyboard produces', () => {
  it('ignores surrounding whitespace and trailing punctuation', () => {
    expect(optOutIntentOf('  הסר  ')).toBe('stop')
    expect(optOutIntentOf('הסר!')).toBe('stop')
    expect(optOutIntentOf('STOP.')).toBe('stop')
    expect(optOutIntentOf('הסר״')).toBe('stop')
  })

  it('ignores niqqud, which is visually identical and compares unequal', () => {
    // U+05B8 QAMATS on the samekh. A customer with a vowelised keyboard sends
    // a string that looks exactly like the bare word.
    expect(optOutIntentOf('הָסר')).toBe('stop')
  })
})

describe('the one exemption', () => {
  it('still sends an OTP to somebody who opted out', () => {
    // Not a loophole. An OTP is not something we send TO a customer; it is
    // something they asked for by pressing a button seconds earlier.
    // Suppressing it locks somebody out of their own account over a STOP they
    // sent two years ago, with no way to discover the cause.
    expect(isOptOutExempt('otp')).toBe(true)
  })

  it('silences everything else, including the coupon code', () => {
    // A real cost, and the right one: the coupon is in their account, their
    // email and the app, and honouring "stop" only when it is cheap is not
    // honouring it.
    for (const kind of [
      'voucher_issued',
      'voucher_expiring',
      'order_shipped',
      'refund_completed',
    ] as const) {
      expect(isOptOutExempt(kind), kind).toBe(false)
    }
  })
})
