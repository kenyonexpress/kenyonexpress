import { describe, expect, it } from 'vitest'
import { validateAddressStep, validateStep } from './steps'
import {
  PHYSICAL_ORDERS_BEFORE_VERIFICATION,
  isCompleteShippingAddress,
  missingShippingFields,
  requiresVerifiedShipping,
} from './verified-shipping'

/**
 * The verified-shipping gate (F42) is a pure function on both sides of the
 * wire, so what the form refuses and what the action refuses is pinned here
 * once, against the same helpers both of them call.
 */
const COMPLETE = {
  full_name: 'דנה כהן',
  phone: '0501234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  street_number: '100',
  zip: '6100000',
}

describe('the threshold', () => {
  it('is five paid physical orders, inclusive', () => {
    expect(PHYSICAL_ORDERS_BEFORE_VERIFICATION).toBe(5)
    expect(requiresVerifiedShipping(0)).toBe(false)
    expect(requiresVerifiedShipping(4)).toBe(false)
    expect(requiresVerifiedShipping(5)).toBe(true)
    expect(requiresVerifiedShipping(12)).toBe(true)
  })

  it('treats a failed count as below the threshold', () => {
    // The server helper returns 0 on a read error; NaN must not open the gate.
    expect(requiresVerifiedShipping(Number.NaN)).toBe(false)
  })
})

describe('a complete shipping address', () => {
  it('needs name, mobile phone, city, street, number and a real postal code', () => {
    expect(isCompleteShippingAddress(COMPLETE)).toBe(true)
    expect(missingShippingFields(COMPLETE)).toEqual([])
  })

  it('names what is missing, including a blank or short postal code', () => {
    expect(missingShippingFields({ ...COMPLETE, zip: '' })).toEqual(['zip'])
    expect(missingShippingFields({ ...COMPLETE, zip: '123' })).toEqual(['zip'])
    expect(missingShippingFields({ ...COMPLETE, zip: null })).toEqual(['zip'])
  })

  it('refuses a landline or a malformed phone', () => {
    expect(missingShippingFields({ ...COMPLETE, phone: '031234567' })).toEqual(['phone'])
    expect(missingShippingFields({ ...COMPLETE, phone: '' })).toEqual(['phone'])
  })

  it('does not require apartment or floor', () => {
    expect(isCompleteShippingAddress({ ...COMPLETE, street_number: '7' })).toBe(true)
  })

  it('lists every gap at once, not just the first', () => {
    expect(missingShippingFields({ full_name: 'א', phone: '', city: '', street: 'x' })).toEqual([
      'phone',
      'city',
      'street_number',
      'zip',
    ])
  })
})

describe('the address step under the gate', () => {
  const filled = { city: 'תל אביב', street: 'דיזנגוף', street_number: '100', zip: '' }

  it('keeps the postal code optional for everyone else', () => {
    expect(validateAddressStep(filled)).toEqual({})
    expect(validateStep('address', filled)).toEqual({})
  })

  it('requires the postal code once verification is required', () => {
    expect(validateAddressStep(filled, { requireComplete: true })).toEqual({ zip: 'שדה חובה' })
    expect(
      validateStep('address', { ...filled, zip: '6100000' }, { requireComplete: true }),
    ).toEqual({})
  })

  it('still reports a malformed code ahead of a missing one', () => {
    const errors = validateAddressStep({ ...filled, zip: '12' }, { requireComplete: true })
    expect(errors.zip).toBeTruthy()
    expect(errors.zip).not.toBe('שדה חובה')
  })
})
