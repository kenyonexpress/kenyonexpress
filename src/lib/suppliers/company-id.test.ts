import {
  type CompanyIdCheck,
  checkCompanyId,
  companyIdKind,
  companyIdMessage,
  normalizeCompanyId,
} from '@/lib/suppliers/company-id'
import { describe, expect, it } from 'vitest'

/** Builds a valid nine-digit number from eight digits by solving the check digit. */
function withCheckDigit(eight: string): string {
  let total = 0
  for (let i = 0; i < 8; i++) {
    const product = Number(eight[i]) * ((i % 2) + 1)
    total += product > 9 ? product - 9 : product
  }
  // Position 8 is even-indexed, so its multiplier is 1 and it contributes itself.
  return eight + String((10 - (total % 10)) % 10)
}

describe('checkCompanyId', () => {
  it('accepts numbers whose check digit agrees', () => {
    for (const eight of ['51234567', '58000000', '01234567', '99999999']) {
      const candidate = withCheckDigit(eight)
      expect(checkCompanyId(candidate).ok, candidate).toBe(true)
    }
  })

  it('rejects a transposed pair, which is the mistake it exists to catch', () => {
    const good = withCheckDigit('51234567')
    const transposed = `${good[0]}${good[2]}${good[1]}${good.slice(3)}`
    // Guard the test itself: a transposition that happens to preserve the sum
    // would make this assertion vacuous.
    if (transposed !== good) {
      expect(checkCompanyId(transposed).ok).toBe(false)
    }
  })

  it('rejects a number that is not nine digits, naming which problem it is', () => {
    for (const value of ['12345678', '1234567890', '51234567a']) {
      const result = checkCompanyId(value)
      expect(result.ok, value).toBe(false)
      expect((result as Extract<CompanyIdCheck, { ok: false }>).reason).toBe('NOT_NINE_DIGITS')
    }
  })

  it('distinguishes empty from malformed, because the messages differ', () => {
    expect((checkCompanyId('') as Extract<CompanyIdCheck, { ok: false }>).reason).toBe('EMPTY')
    expect((checkCompanyId('   ') as Extract<CompanyIdCheck, { ok: false }>).reason).toBe('EMPTY')
  })

  it('does not treat a leading zero as a shorter number', () => {
    // Typing eight digits because the leading zero was dropped is the second
    // most common mistake here, and the message says so.
    const good = withCheckDigit('01234567')
    expect(checkCompanyId(good).ok).toBe(true)
    expect(checkCompanyId(good.slice(1)).ok).toBe(false)
  })
})

describe('normalizeCompanyId', () => {
  it('strips separators and the Hebrew prefix people type', () => {
    expect(normalizeCompanyId(' 512-345-671 ')).toBe('512345671')
    expect(normalizeCompanyId('ח"פ 512345671')).toBe('512345671')
    expect(normalizeCompanyId('ח.פ. 512345671')).toBe('512345671')
    expect(normalizeCompanyId('ע"מ 512345671')).toBe('512345671')
  })

  it('normalizes before validating, so a formatted number is accepted', () => {
    const good = withCheckDigit('51234567')
    const formatted = `${good.slice(0, 3)}-${good.slice(3, 6)}-${good.slice(6)}`
    expect(checkCompanyId(formatted).ok).toBe(true)
    if (checkCompanyId(formatted).ok) {
      expect((checkCompanyId(formatted) as { normalized: string }).normalized).toBe(good)
    }
  })
})

describe('companyIdKind', () => {
  it('reads the leading digits and claims nothing beyond them', () => {
    expect(companyIdKind('580000000')).toBe('association')
    expect(companyIdKind('510000000')).toBe('company')
    // A sole trader registers under their own ID, and that is correct here
    // rather than a gap: their עוסק מורשה number IS their ID.
    expect(companyIdKind('012345678')).toBe('individual')
  })
})

describe('companyIdMessage', () => {
  it('is null for a valid number and a Hebrew sentence otherwise', () => {
    expect(companyIdMessage(checkCompanyId(withCheckDigit('51234567')))).toBeNull()
    for (const value of ['', '123', '512345670000']) {
      const message = companyIdMessage(checkCompanyId(value))
      expect(message, value).toMatch(/[֐-׿]/)
    }
  })

  it('does not describe the check digit in jargon', () => {
    // "ספרת ביקורת שגויה" means nothing to somebody copying a number off a
    // certificate. The message names the likely mistake instead.
    const good = withCheckDigit('51234567')
    const broken = good.slice(0, 8) + String((Number(good[8]) + 1) % 10)
    const message = companyIdMessage(checkCompanyId(broken))
    expect(message).toContain('ספרות')
  })
})
