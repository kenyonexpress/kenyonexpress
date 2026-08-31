import { describe, expect, it } from 'vitest'
import {
  REFERRAL_ALPHABET,
  REFERRAL_CODE_LENGTH,
  normalizeReferralCode,
  referralShareUrl,
} from './code'

/**
 * The alphabet is the contract with `fn_ensure_referral_code`, not a preference.
 *
 * 098 mints over Crockford base32 with I, L, O and U removed. If this module
 * accepted those letters, a mistyped `LOGIN123` would be written to a cookie,
 * carried through a whole signup, and answered `unknown_code` by the database
 * at the one moment nobody is watching a log. Rejecting it at the door is what
 * makes "the cookie holds a code" mean "the cookie holds a code that could
 * exist".
 */
describe('normalizeReferralCode', () => {
  it('accepts a well formed code and upper-cases it', () => {
    expect(normalizeReferralCode('ab12cd34')).toBe('AB12CD34')
  })

  it('trims surrounding whitespace, which a paste carries', () => {
    expect(normalizeReferralCode('  AB12CD34\n')).toBe('AB12CD34')
  })

  it.each(['I', 'L', 'O', 'U'])('rejects %s, the letter the alphabet drops', (letter) => {
    // Seven valid characters plus the excluded one: the right LENGTH, so only
    // the alphabet check can be what refuses it.
    expect(normalizeReferralCode(`ABCDEFG${letter}`)).toBeNull()
  })

  it('rejects the wrong length in both directions', () => {
    expect(normalizeReferralCode('ABCDEFG')).toBeNull()
    expect(normalizeReferralCode('ABCDEFGH9')).toBeNull()
  })

  it('rejects what a scanner puts in a query string', () => {
    expect(normalizeReferralCode('<script>')).toBeNull()
    expect(normalizeReferralCode("' OR 1=1--")).toBeNull()
    expect(normalizeReferralCode('')).toBeNull()
    expect(normalizeReferralCode(null)).toBeNull()
    expect(normalizeReferralCode(undefined)).toBeNull()
  })

  it('accepts every character the minting function can emit', () => {
    // Guards the regex against the alphabet constant drifting apart from it.
    for (const char of REFERRAL_ALPHABET) {
      const code = char.repeat(REFERRAL_CODE_LENGTH)
      expect(normalizeReferralCode(code)).toBe(code)
    }
  })
})

describe('referralShareUrl', () => {
  it('points at the home page with the code as ?ref=', () => {
    expect(referralShareUrl('AB12CD34', 'https://kenyonexpress.co.il')).toBe(
      'https://kenyonexpress.co.il/?ref=AB12CD34',
    )
  })

  it('does not double the slash when the origin carries one', () => {
    expect(referralShareUrl('AB12CD34', 'https://kenyonexpress.co.il/')).toBe(
      'https://kenyonexpress.co.il/?ref=AB12CD34',
    )
  })
})
