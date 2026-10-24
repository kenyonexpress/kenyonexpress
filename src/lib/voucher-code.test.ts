import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSignedRedemptionCode,
  formatRedemptionCode,
  generateRedemptionCode,
  generateUniqueRedemptionCode,
  isValidRedemptionCode,
  normalizeRedemptionCode,
  signRedemptionCode,
  verifyRedemptionCode,
} from './voucher-code'

describe('8-digit redemption codes', () => {
  describe('generateRedemptionCode', () => {
    it('generates an 8-digit string', () => {
      const code = generateRedemptionCode()
      expect(code).toHaveLength(8)
      expect(code).toMatch(/^[0-9]{8}$/)
    })

    it('pads with leading zeros', () => {
      // Mock crypto to return a small number
      const mockBuffer = new Uint32Array([123])
      vi.spyOn(crypto, 'getRandomValues').mockImplementation((arr) => {
        ;(arr as Uint32Array)[0] = mockBuffer[0]!
        return arr
      })

      const code = generateRedemptionCode()
      expect(code).toBe('00000123')

      vi.restoreAllMocks()
    })

    it('generates different codes across multiple calls', () => {
      const codes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        codes.add(generateRedemptionCode())
      }
      expect(codes.size).toBeGreaterThan(95) // Collision extremely unlikely
    })
  })

  describe('validation', () => {
    it('accepts valid 8-digit codes', () => {
      expect(isValidRedemptionCode('00000000')).toBe(true)
      expect(isValidRedemptionCode('12345678')).toBe(true)
      expect(isValidRedemptionCode('99999999')).toBe(true)
    })

    it('rejects non-8-digit strings', () => {
      expect(isValidRedemptionCode('1234567')).toBe(false) // too short
      expect(isValidRedemptionCode('123456789')).toBe(false) // too long
      expect(isValidRedemptionCode('1234-5678')).toBe(false) // has separator
      expect(isValidRedemptionCode('ABCD5678')).toBe(false) // has letters
      expect(isValidRedemptionCode('')).toBe(false)
    })
  })

  describe('normalization', () => {
    it('strips non-digits', () => {
      expect(normalizeRedemptionCode('1234-5678')).toBe('12345678')
      expect(normalizeRedemptionCode('1234 5678')).toBe('12345678')
      expect(normalizeRedemptionCode('ABC-1234-5678-XYZ')).toBe('12345678')
    })

    it('pads short inputs', () => {
      expect(normalizeRedemptionCode('123')).toBe('00000123')
      expect(normalizeRedemptionCode('0')).toBe('00000000')
    })

    it('truncates from left if too long', () => {
      expect(normalizeRedemptionCode('123456789012')).toBe('56789012')
    })
  })

  describe('formatting', () => {
    it('formats as XXXX-XXXX', () => {
      expect(formatRedemptionCode('12345678')).toBe('1234-5678')
      expect(formatRedemptionCode('00000000')).toBe('0000-0000')
      expect(formatRedemptionCode('99999999')).toBe('9999-9999')
    })

    it('normalizes before formatting', () => {
      expect(formatRedemptionCode('1234 5678')).toBe('1234-5678')
      expect(formatRedemptionCode('123')).toBe('0000-0123')
    })
  })
})

describe('signing and verification', () => {
  const VOUCHER_ID = 'abc123-def456-ghi789'
  const VALID_CODE = '12345678'
  const VALID_SECRET = 'test-secret-key-32-characters-long'

  beforeEach(() => {
    vi.stubEnv('VOUCHER_QR_SECRET', VALID_SECRET)
  })

  describe('signRedemptionCode', () => {
    it('produces a base64url signature', () => {
      const sig = signRedemptionCode(VALID_CODE, VOUCHER_ID)
      expect(sig).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(sig.length).toBeGreaterThan(20)
    })

    it('produces different signatures for different codes', () => {
      const sig1 = signRedemptionCode('11111111', VOUCHER_ID)
      const sig2 = signRedemptionCode('22222222', VOUCHER_ID)
      expect(sig1).not.toBe(sig2)
    })

    it('produces different signatures for different vouchers', () => {
      const sig1 = signRedemptionCode(VALID_CODE, 'voucher-1')
      const sig2 = signRedemptionCode(VALID_CODE, 'voucher-2')
      expect(sig1).not.toBe(sig2)
    })

    it('throws on invalid code format', () => {
      expect(() => signRedemptionCode('123', VOUCHER_ID)).toThrow('Invalid redemption code format')
      expect(() => signRedemptionCode('ABCD5678', VOUCHER_ID)).toThrow(
        'Invalid redemption code format',
      )
    })

    it('throws when secret is missing', () => {
      vi.stubEnv('VOUCHER_QR_SECRET', '')
      expect(() => signRedemptionCode(VALID_CODE, VOUCHER_ID)).toThrow(
        'VOUCHER_QR_SECRET is not set',
      )
    })

    it('throws when secret is too short', () => {
      vi.stubEnv('VOUCHER_QR_SECRET', 'short')
      expect(() => signRedemptionCode(VALID_CODE, VOUCHER_ID)).toThrow(
        'VOUCHER_QR_SECRET is not set',
      )
    })
  })

  describe('verifyRedemptionCode', () => {
    it('accepts a valid signature', () => {
      const sig = signRedemptionCode(VALID_CODE, VOUCHER_ID)
      expect(verifyRedemptionCode(VALID_CODE, VOUCHER_ID, sig)).toBe(true)
    })

    it('rejects a tampered code', () => {
      const sig = signRedemptionCode(VALID_CODE, VOUCHER_ID)
      expect(verifyRedemptionCode('88888888', VOUCHER_ID, sig)).toBe(false)
    })

    it('rejects a tampered voucher ID', () => {
      const sig = signRedemptionCode(VALID_CODE, VOUCHER_ID)
      expect(verifyRedemptionCode(VALID_CODE, 'different-voucher', sig)).toBe(false)
    })

    it('rejects a tampered signature', () => {
      const sig = signRedemptionCode(VALID_CODE, VOUCHER_ID)
      const tampered = sig.slice(0, -1) + (sig.slice(-1) === 'A' ? 'B' : 'A')
      expect(verifyRedemptionCode(VALID_CODE, VOUCHER_ID, tampered)).toBe(false)
    })

    it('rejects invalid code format', () => {
      expect(verifyRedemptionCode('123', VOUCHER_ID, 'fake-sig')).toBe(false)
      expect(verifyRedemptionCode('ABCD5678', VOUCHER_ID, 'fake-sig')).toBe(false)
    })

    it('throws when secret is missing', () => {
      vi.stubEnv('VOUCHER_QR_SECRET', '')
      const sig = 'fake-signature'
      expect(() => verifyRedemptionCode(VALID_CODE, VOUCHER_ID, sig)).toThrow(
        'VOUCHER_QR_SECRET is not set',
      )
    })
  })

  describe('createSignedRedemptionCode', () => {
    it('returns a code and signature', () => {
      const { code, signature } = createSignedRedemptionCode(VOUCHER_ID)
      expect(code).toMatch(/^[0-9]{8}$/)
      expect(signature).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('produces verifiable signatures', () => {
      const { code, signature } = createSignedRedemptionCode(VOUCHER_ID)
      expect(verifyRedemptionCode(code, VOUCHER_ID, signature)).toBe(true)
    })
  })

  describe('generateUniqueRedemptionCode', () => {
    it('returns a code not in the exists set', async () => {
      const existing = new Set(['11111111', '22222222'])
      const exists = async (code: string) => existing.has(code)

      const { code, signature } = await generateUniqueRedemptionCode(VOUCHER_ID, exists)

      expect(code).toMatch(/^[0-9]{8}$/)
      expect(existing.has(code)).toBe(false)
      expect(verifyRedemptionCode(code, VOUCHER_ID, signature)).toBe(true)
    })

    it('retries on collision', async () => {
      let attempts = 0
      const exists = async (_code: string) => {
        attempts++
        return attempts <= 2 // First two attempts "collide"
      }

      const { code } = await generateUniqueRedemptionCode(VOUCHER_ID, exists, 5)

      expect(attempts).toBe(3)
      expect(code).toMatch(/^[0-9]{8}$/)
    })

    it('throws after max attempts', async () => {
      const exists = async () => true // Always collides

      await expect(generateUniqueRedemptionCode(VOUCHER_ID, exists, 3)).rejects.toThrow(
        'Could not generate a unique redemption code after 3 attempts',
      )
    })
  })
})
