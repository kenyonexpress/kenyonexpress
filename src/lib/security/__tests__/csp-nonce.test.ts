import { describe, expect, it } from 'vitest'
import { generateNonce } from '../csp-nonce'

describe('CSP Nonce', () => {
  describe('generateNonce', () => {
    it('generates a base64 string', () => {
      const nonce = generateNonce()
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
    })

    it('generates unique nonces', () => {
      const nonce1 = generateNonce()
      const nonce2 = generateNonce()
      expect(nonce1).not.toBe(nonce2)
    })

    it('generates nonces of expected length', () => {
      const nonce = generateNonce()
      // 16 bytes encoded as base64 should be 24 characters (padding may reduce this slightly)
      expect(nonce.length).toBeGreaterThanOrEqual(22)
      expect(nonce.length).toBeLessThanOrEqual(24)
    })

    it('generates cryptographically random nonces', () => {
      const nonces = new Set<string>()
      // Generate 1000 nonces and check for uniqueness
      for (let i = 0; i < 1000; i++) {
        nonces.add(generateNonce())
      }
      // All should be unique
      expect(nonces.size).toBe(1000)
    })
  })
})
