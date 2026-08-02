import { describe, expect, it } from 'vitest'
import {
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_LENGTH,
  VoucherCodeCollisionError,
  computeVoucherExpiry,
  formatVoucherCode,
  generateUniqueVoucherCode,
  generateVoucherCode,
  isValidVoucherCode,
  normalizeVoucherCode,
} from './code'

describe('voucher code format', () => {
  it('generates 10 symbols from the unambiguous alphabet', () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateVoucherCode()
      expect(code).toHaveLength(VOUCHER_CODE_LENGTH)
      expect(isValidVoucherCode(code)).toBe(true)
      for (const ch of code) expect(VOUCHER_CODE_ALPHABET).toContain(ch)
    }
  })

  it('never emits the ambiguous letters I, L, O, U', () => {
    for (let i = 0; i < 2000; i++) {
      expect(/[ILOU]/.test(generateVoucherCode())).toBe(false)
    }
  })

  it('validates length and alphabet', () => {
    expect(isValidVoucherCode('0123456789')).toBe(true)
    expect(isValidVoucherCode('ABCDEFGHJK')).toBe(true)
    expect(isValidVoucherCode('ABCDEFGHJ')).toBe(false) // 9
    expect(isValidVoucherCode('ABCDEFGHJKM')).toBe(false) // 11
    expect(isValidVoucherCode('ABCDEFGHIK')).toBe(false) // contains I
    expect(isValidVoucherCode('abcdefghjk')).toBe(false) // lowercase
    expect(isValidVoucherCode('ABCDEF-GHJK')).toBe(false) // separator
  })
})

describe('distribution sanity', () => {
  // Rejection sampling must not starve or over-represent any symbol. With 40k
  // symbols across 32 buckets the expected count is 1250; a loose band catches
  // a modulo bias (which would spike 0-7) without being flaky.
  it('spreads symbols roughly uniformly', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 4000; i++) {
      for (const ch of generateVoucherCode()) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1)
      }
    }
    expect(counts.size).toBe(VOUCHER_CODE_ALPHABET.length)
    for (const symbol of VOUCHER_CODE_ALPHABET) {
      const count = counts.get(symbol) ?? 0
      expect(count).toBeGreaterThan(1250 * 0.6)
      expect(count).toBeLessThan(1250 * 1.4)
    }
  })
})

describe('normalize and format', () => {
  it('strips separators and upper-cases for lookup', () => {
    expect(normalizeVoucherCode('abcde-fghjk')).toBe('ABCDEFGHJK')
    expect(normalizeVoucherCode('  abc de fg hj  ')).toBe('ABCDEFGHJ')
  })

  it('groups into XXXXX-XXXXX for display', () => {
    expect(formatVoucherCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
    expect(formatVoucherCode('abcde-fghjk')).toBe('ABCDE-FGHJK')
  })
})

describe('collision handling', () => {
  it('returns the first code the probe reports free', async () => {
    const taken = new Set<string>()
    const code = await generateUniqueVoucherCode(async (c) => taken.has(c))
    expect(isValidVoucherCode(code)).toBe(true)
  })

  it('retries while the probe reports the code taken', async () => {
    let calls = 0
    const code = await generateUniqueVoucherCode(async () => {
      calls++
      return calls < 3 // first two are "taken"
    })
    expect(calls).toBe(3)
    expect(isValidVoucherCode(code)).toBe(true)
  })

  it('throws rather than reuse a code when every probe reports taken', async () => {
    await expect(generateUniqueVoucherCode(async () => true, 4)).rejects.toBeInstanceOf(
      VoucherCodeCollisionError,
    )
  })
})

describe('TTL / expiry', () => {
  const issuedAt = new Date('2026-07-24T00:00:00.000Z')

  it('uses the rolling window when it falls before the offer deadline', () => {
    const offerValidUntil = new Date('2026-12-31T00:00:00.000Z')
    const expiry = computeVoucherExpiry({ issuedAt, couponExpiryDays: 30, offerValidUntil })
    expect(expiry.toISOString()).toBe('2026-08-23T00:00:00.000Z')
  })

  it('clamps to offer_valid_until when the rolling window overshoots it', () => {
    const offerValidUntil = new Date('2026-08-01T00:00:00.000Z')
    const expiry = computeVoucherExpiry({ issuedAt, couponExpiryDays: 90, offerValidUntil })
    expect(expiry).toBe(offerValidUntil)
  })

  it('never exceeds offer_valid_until (the DB CHECK invariant)', () => {
    const offerValidUntil = new Date('2026-08-10T00:00:00.000Z')
    for (const days of [1, 7, 30, 60, 90, 365]) {
      const expiry = computeVoucherExpiry({ issuedAt, couponExpiryDays: days, offerValidUntil })
      expect(expiry.getTime()).toBeLessThanOrEqual(offerValidUntil.getTime())
    }
  })
})
