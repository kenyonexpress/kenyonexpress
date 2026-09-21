import { describe, expect, it } from 'vitest'
import { paymentReturnMessage, paymentReturnTarget } from './frame-return-message'

const OWN = 'https://kenyonexpress.co.il'

describe('paymentReturnTarget', () => {
  it('accepts our own message from our own origin', () => {
    const msg = paymentReturnMessage('/checkout/return?order_id=abc')
    expect(paymentReturnTarget(msg, OWN, OWN)).toBe('/checkout/return?order_id=abc')
  })

  it('refuses a message from any other origin, even with the right shape', () => {
    const msg = paymentReturnMessage('/checkout/return?order_id=abc')
    expect(paymentReturnTarget(msg, 'https://secure.cardcom.solutions', OWN)).toBeNull()
    expect(paymentReturnTarget(msg, 'null', OWN)).toBeNull()
  })

  it('refuses a target that is not a path under /checkout/', () => {
    for (const target of [
      'https://evil.example/checkout/return',
      '//evil.example/checkout/return',
      '/account',
      '/checkoutx/return',
      '/checkout/return\u0000',
      42,
      undefined,
    ]) {
      expect(paymentReturnTarget({ type: 'kenyon:payment-return', target }, OWN, OWN)).toBeNull()
    }
  })

  it('refuses every other message shape', () => {
    expect(paymentReturnTarget(null, OWN, OWN)).toBeNull()
    expect(paymentReturnTarget('kenyon:payment-return', OWN, OWN)).toBeNull()
    expect(paymentReturnTarget({ type: 'other', target: '/checkout/return' }, OWN, OWN)).toBeNull()
  })
})
