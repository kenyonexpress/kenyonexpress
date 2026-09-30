import { describe, expect, it } from 'vitest'
import {
  SIGNUP_UID_COOKIE,
  SIGNUP_UID_MAX_AGE,
  confirmPath,
  issueFailureHebrew,
  phoneTakenByAnotherAccount,
  signupStepAfterOtp,
  verifyOutcomeHebrew,
  verifyPhonePath,
} from './signup-phone'

describe('signupStepAfterOtp', () => {
  it('goes to the code screen when a code went out, carrying next', () => {
    expect(
      signupStepAfterOtp(
        { ok: true, to: '+972501234567', expiresAt: 'x', segments: 1 },
        '/checkout',
      ),
    ).toEqual({
      path: '/signup/verify-phone?phone=%2B972501234567&next=%2Fcheckout',
      verifying: true,
    })
  })

  it('goes straight to the email step when SMS could not be issued', () => {
    for (const reason of [
      'bad_phone',
      'sms_unavailable',
      'store_unavailable',
      'send_failed',
    ] as const) {
      expect(signupStepAfterOtp({ ok: false, reason }, null)).toEqual({
        path: '/signup/confirm',
        verifying: false,
      })
    }
  })
})

describe('paths', () => {
  it('encodes the plus and keeps next optional', () => {
    expect(verifyPhonePath('+972501234567', undefined)).toBe(
      '/signup/verify-phone?phone=%2B972501234567',
    )
    expect(confirmPath(undefined, true)).toBe('/signup/confirm?phone=verified')
    expect(confirmPath('/account', true)).toBe('/signup/confirm?phone=verified&next=%2Faccount')
    expect(confirmPath(null, false)).toBe('/signup/confirm')
  })
})

describe('Hebrew', () => {
  it('tells a locked-out customer to ask for a new code, not to retry', () => {
    expect(verifyOutcomeHebrew('locked')).toContain('בקשו קוד חדש')
    expect(verifyOutcomeHebrew('wrong')).toContain('נסו שוב')
    expect(verifyOutcomeHebrew('expired')).toContain('פג תוקף')
    expect(verifyOutcomeHebrew('unavailable')).toContain('להמשיך בלעדיו')
  })

  it('never names the provider in an issue failure', () => {
    for (const reason of [
      'bad_phone',
      'sms_unavailable',
      'store_unavailable',
      'send_failed',
    ] as const) {
      const text = issueFailureHebrew(reason)
      expect(text.toLowerCase()).not.toContain('twilio')
      expect(text.toLowerCase()).not.toContain('upstash')
    }
  })
})

describe('signup cookie', () => {
  it('outlives the code by five minutes so a resend still knows the user', () => {
    expect(SIGNUP_UID_COOKIE).toBe('ke_signup_uid')
    expect(SIGNUP_UID_MAX_AGE).toBe(900)
  })
})

describe('phoneTakenByAnotherAccount', () => {
  it('matches GoTrue wording and nothing else', () => {
    expect(
      phoneTakenByAnotherAccount('A user with this phone number has already been registered'),
    ).toBe(true)
    expect(phoneTakenByAnotherAccount('Phone number already exists')).toBe(true)
    expect(phoneTakenByAnotherAccount('Invalid phone')).toBe(false)
    expect(phoneTakenByAnotherAccount('Email already registered')).toBe(false)
  })
})
