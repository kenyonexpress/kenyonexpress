import {
  electroHasSteps,
  electroPlaceOrderLabel,
  isDemoFiller,
  sectionsFromElectro,
} from '@/lib/checkout/electro-content'
import { describe, expect, it } from 'vitest'
import capture from '../../../refs/electro-checkout-text.json'

/**
 * These assert against the committed capture, so they are checking a
 * measurement rather than a memory. If refs/electro-checkout-text.json is
 * refreshed and Electro has changed, this file is what says so.
 */

describe('the Electro capture', () => {
  it('loaded a real checkout, not an empty basket', () => {
    // A fresh browser context has no cart cookie and Electro then renders only
    // "Your cart is currently empty." That is what a useless capture looks
    // like, and it is worth being able to tell the two apart.
    expect(capture.labels.length).toBeGreaterThan(10)
    expect(capture.headings).toContain('Billing details')
    expect(capture.placeOrder).toBe('Place order')
  })

  it('shows Electro has no stepper of its own', () => {
    // The finding the fourth step rests on. Electro matched nothing for
    // [class*="step"], and `checkout-steps` was the one element missing from an
    // otherwise 11/12 measurement at both breakpoints. So there is no Electro
    // step to copy, only a final block to carry.
    expect(capture.stepLike).toEqual([])
    expect(electroHasSteps()).toBe(false)
  })

  it('ends on a payment notice, a privacy sentence and a terms tickbox', () => {
    expect(capture.notices.length).toBeGreaterThan(0)
    expect(capture.terms.trim()).not.toBe('')
    expect(capture.labels.some((l) => /terms and conditions/i.test(l))).toBe(true)
  })
})

describe('isDemoFiller', () => {
  it('recognises the theme filler that must never ship', () => {
    expect(isDemoFiller(capture.terms)).toBe(true)
    expect(isDemoFiller('Test mode: use card 4242 4242 4242 4242')).toBe(true)
  })

  it('leaves real copy alone', () => {
    expect(isDemoFiller('Returning customer? Click here to login')).toBe(false)
    expect(isDemoFiller('אמצעי התשלום')).toBe(false)
  })

  it('proves the captured terms text is filler, which is why it is not shipped', () => {
    // Electro's own terms block opens "Intellectual Propertly Lorem ipsum
    // dolor sit amet". Copying that into a live Hebrew checkout would be worse
    // than writing nothing, so only the STRUCTURE is taken from it.
    expect(capture.terms).toMatch(/lorem ipsum/i)
  })
})

describe('sectionsFromElectro', () => {
  it('derives the final block in the order Electro presents it', () => {
    expect(sectionsFromElectro().map((s) => s.id)).toEqual(['payment-note', 'privacy', 'terms'])
  })

  it('gives every section Hebrew copy, never Electro English', () => {
    for (const section of sectionsFromElectro()) {
      expect(section.title).toMatch(/[֐-׿]/)
      expect(isDemoFiller(section.title)).toBe(false)
    }
  })
})

describe('electroPlaceOrderLabel', () => {
  it('exposes the reference label for comparison, not for shipping', () => {
    // Ours is Hebrew. This is here so the copy can be checked against the
    // reference instead of asserted from memory.
    expect(electroPlaceOrderLabel()).toBe('Place order')
  })
})
