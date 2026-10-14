import {
  NEW_CARD_METHOD_ID,
  cardBrandLabel,
  defaultPaymentChoice,
  describeSavedCard,
  isSavedCardChoice,
  paymentMethodOptions,
} from '@/lib/checkout/payment-methods'
import { describe, expect, it } from 'vitest'

/**
 * The payment method options (UX17). Pinned: the values are the two things
 * `submitCheckout` can read (a token id, or 'new'), saved cards lead and the
 * hosted page closes the list, the default is the default card, and every
 * word a shopper reads is Hebrew.
 */

const VISA = { id: 'tok-1', last4: '4242', brand: 'visa', isDefault: false }
const MASTER = { id: 'tok-2', last4: '1111', brand: 'MasterCard', isDefault: true }

describe('paymentMethodOptions', () => {
  it('offers only the hosted page to a shopper with no saved card, ticked by default', () => {
    const options = paymentMethodOptions([])
    expect(options).toHaveLength(1)
    expect(options[0]?.id).toBe(NEW_CARD_METHOD_ID)
    expect(options[0]?.kind).toBe('hosted-card')
    expect(options[0]?.label).toBe('כרטיס אשראי')
    expect(defaultPaymentChoice([])).toBe('new')
  })

  it('lists the saved cards first, as handed, then "another card"', () => {
    const options = paymentMethodOptions([MASTER, VISA])
    expect(options.map((o) => o.id)).toEqual(['tok-2', 'tok-1', 'new'])
    expect(options[0]?.kind).toBe('saved-card')
    expect(options[2]?.label).toBe('כרטיס אחר')
  })

  it('names a saved card by its brand in Hebrew and its last four digits', () => {
    expect(describeSavedCard(VISA)).toBe('ויזה המסתיים ב-4242')
    expect(describeSavedCard(MASTER)).toBe('מאסטרקארד המסתיים ב-1111')
    expect(describeSavedCard({ last4: null, brand: null })).toBe('כרטיס המסתיים ב-****')
  })

  it('reads the brand case-insensitively and falls back to the plain word', () => {
    expect(cardBrandLabel('VISA')).toBe('ויזה')
    expect(cardBrandLabel('amex')).toBe('אמריקן אקספרס')
    expect(cardBrandLabel('American Express')).toBe('אמריקן אקספרס')
    expect(cardBrandLabel('isracard')).toBe('ישראכרט')
    expect(cardBrandLabel('diners club')).toBe('דיינרס')
    expect(cardBrandLabel('unionpay')).toBe('כרטיס')
    expect(cardBrandLabel(undefined)).toBe('כרטיס')
  })

  it('carries the default flag on exactly the default card', () => {
    const options = paymentMethodOptions([VISA, MASTER])
    expect(options.filter((o) => o.isDefault).map((o) => o.id)).toEqual(['tok-2'])
  })

  it('writes every label and detail in Hebrew, brand names aside', () => {
    for (const option of paymentMethodOptions([VISA, MASTER])) {
      expect(option.label).toMatch(/[֐-׿]/)
      expect(option.detail).toMatch(/[֐-׿]/)
    }
  })
})

describe('defaultPaymentChoice', () => {
  it('is the default card when there is one, else the first card, else the hosted page', () => {
    expect(defaultPaymentChoice([VISA, MASTER])).toBe('tok-2')
    expect(defaultPaymentChoice([VISA])).toBe('tok-1')
    expect(defaultPaymentChoice([])).toBe('new')
  })
})

describe('isSavedCardChoice', () => {
  it('is true for a token id and false for the hosted page or nothing', () => {
    expect(isSavedCardChoice('tok-1')).toBe(true)
    expect(isSavedCardChoice('new')).toBe(false)
    expect(isSavedCardChoice('')).toBe(false)
    expect(isSavedCardChoice(null)).toBe(false)
  })
})
