import { describe, expect, it } from 'vitest'
import { beginCheckoutInputSchema } from './checkout'

/**
 * The gift extras from 226 at the boundary they arrive on.
 *
 * `gift_wrap` is a BOOLEAN and never an amount, and that is the whole shape of
 * the rule: the price lives in `GIFT_WRAP_FEE_AGOROT` on the server, so a
 * client cannot name its own fee - and in particular cannot name a negative one
 * and turn a wrapping charge into an unauthorised discount funded out of the
 * platform's share.
 */

const base = {
  client_ref: '7f9d2a1b-3c4e-4f5a-8b6c-9d0e1f2a3b4c',
  accept_terms: true,
  apply_wallet_ils: 0,
  save_card: true,
}

describe('beginCheckoutInputSchema — gift extras', () => {
  it('accepts a gift with a send date and wrapping', () => {
    const parsed = beginCheckoutInputSchema.safeParse({
      ...base,
      gift_recipient_email: 'dana@example.com',
      gift_recipient_name: 'דנה',
      gift_deliver_at: '2026-12-24',
      gift_wrap: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a plain gift with neither, which is every gift before 226', () => {
    const parsed = beginCheckoutInputSchema.safeParse({
      ...base,
      gift_recipient_email: 'dana@example.com',
    })
    expect(parsed.success).toBe(true)
  })

  it('REFUSES wrapping on an order that is not a gift', () => {
    /**
     * Refused rather than ignored, and the fee is why. Such a request is either
     * a form bug or a hand-built call; dropping it quietly is the version where
     * nobody finds out until somebody is holding a ₪15 charge on an order that
     * is not a gift and nothing explains it.
     */
    const parsed = beginCheckoutInputSchema.safeParse({ ...base, gift_wrap: true })
    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('expected a refusal')
    expect(parsed.error.issues.some((i) => i.path.includes('gift_wrap'))).toBe(true)
  })

  it('refuses a send date on an order that is not a gift', () => {
    const parsed = beginCheckoutInputSchema.safeParse({ ...base, gift_deliver_at: '2026-12-24' })
    expect(parsed.success).toBe(false)
  })

  it('accepts gift_wrap: false without a recipient, because it asks for nothing', () => {
    const parsed = beginCheckoutInputSchema.safeParse({ ...base, gift_wrap: false })
    expect(parsed.success).toBe(true)
  })

  it('will not take a fee AMOUNT from the client under any name', () => {
    const parsed = beginCheckoutInputSchema.safeParse({
      ...base,
      gift_recipient_email: 'dana@example.com',
      gift_wrap: -5000 as never,
    })
    // Not a boolean, so it never becomes a number the settlement could use.
    expect(parsed.success).toBe(false)
  })

  it('bounds the date string, because it is user input reaching a Date parser', () => {
    const parsed = beginCheckoutInputSchema.safeParse({
      ...base,
      gift_recipient_email: 'dana@example.com',
      gift_deliver_at: 'x'.repeat(4000),
    })
    expect(parsed.success).toBe(false)
  })
})
