import { describe, expect, it } from 'vitest'
import { CTA_COPY, ctaCopy } from './cta-copy'
import { CTA_COPY_EXPERIMENT } from './experiments'

describe('the cta_copy arms', () => {
  it('covers every registered variant with three non-empty strings', () => {
    for (const variant of CTA_COPY_EXPERIMENT.variants) {
      const copy = CTA_COPY[variant]
      expect(copy, variant).toBeDefined()
      for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps control on the live site wording, copied not corrected', () => {
    expect(ctaCopy('control')).toEqual({
      addToCart: 'הוסף לסל',
      buyCoupon: 'קנה עכשיו',
      buyNow: 'קנה עכשיו',
    })
  })

  it('changes every string in the invite arm, and nothing but words', () => {
    const control = ctaCopy('control')
    const invite = ctaCopy('invite')
    expect(invite.addToCart).not.toBe(control.addToCart)
    expect(invite.buyCoupon).not.toBe(control.buyCoupon)
    expect(invite.buyNow).not.toBe(control.buyNow)
    // No price, number or shekel sign in a button label: the price is on
    // the page, and a label that quotes it drifts the day the price moves.
    for (const value of Object.values(invite)) expect(value).not.toMatch(/[0-9₪]/)
  })
})
