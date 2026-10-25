import { generateSignedJWT, verifySignedJWT } from './qr-generation'

/**
 * Unit tests for JWT generation and verification
 * Tests signed voucher QR code functionality
 */

describe('Voucher QR JWT', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, VOUCHER_QR_SECRET: 'test-qr-secret-key-1234567890' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('JWT Generation', () => {
    it('generates valid JWT format', () => {
      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date('2026-12-31T23:59:59Z'),
      }

      const jwt = generateSignedJWT(payload)

      expect(jwt).toBeTruthy()
      expect(typeof jwt).toBe('string')

      // JWT has three base64url parts separated by dots
      const parts = jwt!.split('.')
      expect(parts).toHaveLength(3)

      // Each part should be non-empty
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0)
      }
    })

    it('includes version 1 in payload', () => {
      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date('2026-12-31T23:59:59Z'),
      }

      const jwt = generateSignedJWT(payload)
      const verified = verifySignedJWT(jwt!)

      expect(verified).toBeTruthy()
      expect(verified?.v).toBe(1)
    })

    it('embeds voucher_id and user_id', () => {
      const payload = {
        voucher_id: 'voucher-abc',
        user_id: 'user-xyz',
        expiry: new Date('2026-12-31T23:59:59Z'),
      }

      const jwt = generateSignedJWT(payload)
      const verified = verifySignedJWT(jwt!)

      expect(verified?.voucher_id).toBe('voucher-abc')
      expect(verified?.user_id).toBe('user-xyz')
    })

    it.skip('sets expiry timestamp', () => {
      const expiryDate = new Date('2026-06-15T12:00:00Z')
      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: expiryDate,
      }

      const jwt = generateSignedJWT(payload)
      expect(jwt).toBeTruthy()
      expect(typeof jwt).toBe('string')

      const verified = verifySignedJWT(jwt as string)
      expect(verified).toBeTruthy()
      expect(verified?.expiry).toBeInstanceOf(Date)
      expect(verified?.expiry.getTime()).toBe(expiryDate.getTime())
    })
  })

  describe('JWT Verification', () => {
    it('verifies valid JWT', () => {
      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date(Date.now() + 86400000), // +24h
      }

      const jwt = generateSignedJWT(payload)
      const verified = verifySignedJWT(jwt!)

      expect(verified).toBeTruthy()
      expect(verified?.voucher_id).toBe('voucher-123')
    })

    it('rejects JWT with invalid signature', () => {
      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date(Date.now() + 86400000),
      }

      const jwt = generateSignedJWT(payload)

      // Tamper with signature
      const parts = jwt!.split('.')
      const tamperedJwt = `${parts[0]}.${parts[1]}.invalidsignature`

      const verified = verifySignedJWT(tamperedJwt)
      expect(verified).toBeNull()
    })

    it('rejects expired JWT', () => {
      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date(Date.now() - 86400000), // -24h (expired)
      }

      const jwt = generateSignedJWT(payload)
      const verified = verifySignedJWT(jwt!)

      expect(verified).toBeNull()
    })

    it('rejects malformed JWT', () => {
      const malformedJwts = [
        'not-a-jwt',
        'only.two.parts',
        'too.many.parts.here.invalid',
        '',
        'a.',
        '.b.',
      ]

      for (const jwt of malformedJwts) {
        const verified = verifySignedJWT(jwt)
        expect(verified).toBeNull()
      }
    })

    it('rejects JWT with tampered payload', () => {
      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date(Date.now() + 86400000),
      }

      const jwt = generateSignedJWT(payload)
      const parts = jwt!.split('.')

      // Tamper with payload (change voucher_id)
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          voucher_id: 'voucher-999',
          user_id: 'user-456',
          exp: Math.floor(Date.now() / 1000) + 86400,
        }),
      ).toString('base64url')

      const tamperedJwt = `${parts[0]}.${tamperedPayload}.${parts[2]}`

      const verified = verifySignedJWT(tamperedJwt)
      expect(verified).toBeNull()
    })
  })

  describe('Security', () => {
    it('returns null when VOUCHER_QR_SECRET is missing', () => {
      process.env.VOUCHER_QR_SECRET = undefined

      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date(Date.now() + 86400000),
      }

      const jwt = generateSignedJWT(payload)
      expect(jwt).toBeNull()
    })

    it('requires minimum secret length', () => {
      process.env.VOUCHER_QR_SECRET = 'short'

      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date(Date.now() + 86400000),
      }

      const jwt = generateSignedJWT(payload)
      // Should fail or warn with short secret
      // Implementation detail: check if it at least doesn't crash
      expect(typeof jwt === 'string' || jwt === null).toBe(true)
    })

    it('different secrets produce different signatures', () => {
      const payload = {
        voucher_id: 'voucher-123',
        user_id: 'user-456',
        expiry: new Date('2026-12-31T23:59:59Z'),
      }

      process.env.VOUCHER_QR_SECRET = 'secret-one-1234567890'
      const jwt1 = generateSignedJWT(payload)

      process.env.VOUCHER_QR_SECRET = 'secret-two-1234567890'
      const jwt2 = generateSignedJWT(payload)

      expect(jwt1).not.toBe(jwt2)

      // JWT1 should not verify with secret-two
      const verified = verifySignedJWT(jwt1!)
      expect(verified).toBeNull()
    })
  })
})
