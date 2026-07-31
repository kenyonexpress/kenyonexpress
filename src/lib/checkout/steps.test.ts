import {
  CHECKOUT_STEPS,
  type StepValues,
  checkEmail,
  checkIsraeliMobile,
  classifyCheckoutFailure,
  furthestReachableStep,
  isLastStep,
  nextStep,
  previousStep,
  stepsBefore,
  validateAddressStep,
  validateDetailsStep,
  validateReviewStep,
  validateStep,
} from '@/lib/checkout/steps'
import { describe, expect, it } from 'vitest'

/**
 * The step gate is the only thing standing between a shopper and a pay button
 * with an empty address behind it, and it runs entirely in the browser. Testing
 * it through the component would mean asserting on rendering to learn something
 * about validation, so the rules live in pure functions and are asserted here
 * directly.
 */

const complete: StepValues = {
  first_name: 'ישראל',
  last_name: 'ישראלי',
  phone: '0521234567',
  email: 'israel@example.com',
  city: 'תל אביב',
  street: 'דיזנגוף',
  street_number: '12',
  zip: '6100000',
  accept_terms: 'on',
}

describe('checkIsraeliMobile', () => {
  it('accepts a plain mobile number', () => {
    expect(checkIsraeliMobile('0521234567')).toBeNull()
  })

  it('accepts the separators people actually type', () => {
    expect(checkIsraeliMobile('052-123-4567')).toBeNull()
    expect(checkIsraeliMobile('052 123 4567')).toBeNull()
    expect(checkIsraeliMobile('(052) 1234567')).toBeNull()
  })

  it('accepts the international form', () => {
    expect(checkIsraeliMobile('+972521234567')).toBeNull()
    expect(checkIsraeliMobile('972521234567')).toBeNull()
  })

  it('rejects a landline, which cannot receive the coupon SMS', () => {
    expect(checkIsraeliMobile('031234567')).not.toBeNull()
  })

  it('rejects the wrong length', () => {
    expect(checkIsraeliMobile('052123456')).not.toBeNull()
    expect(checkIsraeliMobile('05212345678')).not.toBeNull()
  })

  it('rejects letters rather than stripping them', () => {
    expect(checkIsraeliMobile('052123456a')).toBe('מספר טלפון מכיל ספרות בלבד')
  })

  it('reports an empty field as required', () => {
    expect(checkIsraeliMobile('')).toBe('שדה חובה')
    expect(checkIsraeliMobile('   ')).toBe('שדה חובה')
    expect(checkIsraeliMobile(undefined)).toBe('שדה חובה')
  })
})

describe('checkEmail', () => {
  it('accepts an ordinary address', () => {
    expect(checkEmail('israel@example.com')).toBeNull()
    expect(checkEmail('a.b+tag@sub.example.co.il')).toBeNull()
  })

  it('rejects an address with no domain dot', () => {
    expect(checkEmail('israel@example')).not.toBeNull()
  })

  it('rejects a missing or doubled at sign', () => {
    expect(checkEmail('israel.example.com')).not.toBeNull()
    expect(checkEmail('a@b@example.com')).not.toBeNull()
  })

  it('rejects an embedded space, which is usually a paste artefact', () => {
    expect(checkEmail('israel @example.com')).toBe('כתובת אימייל לא יכולה להכיל רווח')
  })

  it('reports an empty field as required', () => {
    expect(checkEmail('')).toBe('שדה חובה')
  })
})

describe('validateDetailsStep', () => {
  it('passes a filled step', () => {
    expect(validateDetailsStep(complete)).toEqual({})
  })

  it('names every missing field at once rather than one at a time', () => {
    const errors = validateDetailsStep({})
    expect(Object.keys(errors).sort()).toEqual(['email', 'first_name', 'last_name', 'phone'])
  })

  it('does not care about the address', () => {
    expect(validateDetailsStep({ ...complete, city: '', street: '' })).toEqual({})
  })
})

describe('validateAddressStep', () => {
  it('passes a filled step', () => {
    expect(validateAddressStep(complete)).toEqual({})
  })

  it('requires city, street and house number', () => {
    const errors = validateAddressStep({})
    expect(Object.keys(errors).sort()).toEqual(['city', 'street', 'street_number'])
  })

  it('treats an absent postal code as fine, since it is optional', () => {
    expect(validateAddressStep({ ...complete, zip: '' })).toEqual({})
    expect(validateAddressStep({ ...complete, zip: undefined })).toEqual({})
  })

  it('still rejects a postal code that is present and wrong', () => {
    expect(validateAddressStep({ ...complete, zip: '12' }).zip).toBeTruthy()
    expect(validateAddressStep({ ...complete, zip: '12a4567' }).zip).toBeTruthy()
  })

  it('keeps accepting the legacy 5 digit code', () => {
    expect(validateAddressStep({ ...complete, zip: '61000' })).toEqual({})
  })
})

describe('validateReviewStep', () => {
  it('requires the terms checkbox', () => {
    expect(validateReviewStep({ accept_terms: 'on' })).toEqual({})
    expect(validateReviewStep({}).accept_terms).toBe('יש לאשר את תנאי השימוש')
    expect(validateReviewStep({ accept_terms: 'off' }).accept_terms).toBeTruthy()
  })
})

describe('step order', () => {
  it('runs details, address, review', () => {
    expect(CHECKOUT_STEPS).toEqual(['details', 'address', 'review'])
  })

  it('reports what has to be clear before a step', () => {
    expect(stepsBefore('details')).toEqual([])
    expect(stepsBefore('address')).toEqual(['details'])
    expect(stepsBefore('review')).toEqual(['details', 'address'])
  })

  it('clamps at both ends instead of running off the array', () => {
    expect(nextStep('review')).toBe('review')
    expect(previousStep('details')).toBe('details')
    expect(nextStep('details')).toBe('address')
    expect(previousStep('review')).toBe('address')
  })

  it('knows the last step', () => {
    expect(isLastStep('review')).toBe(true)
    expect(isLastStep('details')).toBe(false)
  })
})

describe('furthestReachableStep', () => {
  it('stops at the first step that does not validate', () => {
    expect(furthestReachableStep({})).toBe('details')
    expect(furthestReachableStep({ ...complete, city: '' })).toBe('address')
  })

  it('reaches the last step on a complete form', () => {
    expect(furthestReachableStep(complete)).toBe('review')
  })

  it('reopens where the form broke, not at the end', () => {
    // Everything but the phone. The shopper should land back on step 1.
    expect(furthestReachableStep({ ...complete, phone: '' })).toBe('details')
  })

  it('holds at review when only the terms are unticked', () => {
    expect(furthestReachableStep({ ...complete, accept_terms: undefined })).toBe('review')
  })
})

describe('validateStep dispatch', () => {
  it('routes each step to its own rules', () => {
    expect(validateStep('details', complete)).toEqual({})
    expect(validateStep('address', complete)).toEqual({})
    expect(validateStep('review', complete)).toEqual({})
    expect(validateStep('details', {}).phone).toBeTruthy()
  })
})

describe('classifyCheckoutFailure', () => {
  // The codes below are the ones beginCheckout really returns. If that list
  // changes, this test is the thing that should fail.
  it('calls a provider connection failure retryable, since nothing was decided', () => {
    expect(classifyCheckoutFailure('PAYMENT_PROVIDER_ERROR')).toBe('retryable')
  })

  it('calls rate limiting retryable, because it literally says to wait', () => {
    expect(classifyCheckoutFailure('RATE_LIMITED')).toBe('retryable')
  })

  it('calls a bad saved card retryable, since another card works', () => {
    expect(classifyCheckoutFailure('NOT_FOUND')).toBe('retryable')
    expect(classifyCheckoutFailure('VALIDATION')).toBe('retryable')
  })

  it('ignores case and surrounding space in the code', () => {
    expect(classifyCheckoutFailure(' rate_limited ')).toBe('retryable')
  })

  it('calls a refusal terminal, so the shopper is not looped through it', () => {
    expect(classifyCheckoutFailure('CHECKOUT_DISABLED')).toBe('terminal')
    expect(classifyCheckoutFailure('UNAUTHENTICATED')).toBe('terminal')
    expect(classifyCheckoutFailure('ADDRESS_REQUIRED')).toBe('terminal')
    expect(classifyCheckoutFailure('INSUFFICIENT_WALLET')).toBe('terminal')
    expect(classifyCheckoutFailure('IDEMPOTENT_REPLAY')).toBe('terminal')
    expect(classifyCheckoutFailure('INTERNAL')).toBe('terminal')
  })

  it('defaults to terminal, so an unknown failure never offers a loop', () => {
    expect(classifyCheckoutFailure('SOMETHING_NEW')).toBe('terminal')
    expect(classifyCheckoutFailure(null)).toBe('terminal')
    expect(classifyCheckoutFailure(undefined)).toBe('terminal')
    expect(classifyCheckoutFailure('')).toBe('terminal')
  })
})
