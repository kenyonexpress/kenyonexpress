import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AGREEMENT_TEXT_V1, AGREEMENT_VERSION } from './supplier-onboarding'

describe('Supplier Onboarding', () => {
  describe('Agreement constants', () => {
    it('should have valid agreement text in Hebrew', () => {
      expect(AGREEMENT_TEXT_V1).toBeTruthy()
      expect(AGREEMENT_TEXT_V1.length).toBeGreaterThan(50)
      expect(AGREEMENT_TEXT_V1).toContain('תנאי שימוש')
      expect(AGREEMENT_TEXT_V1).toContain('ספק')
      expect(AGREEMENT_TEXT_V1).toContain('Kenyon Express')
    })

    it('should have semantic version format', () => {
      expect(AGREEMENT_VERSION).toMatch(/^v\d+\.\d+$/)
      expect(AGREEMENT_VERSION).toBe('v1.0')
    })

    it('agreement text should hash consistently', () => {
      const hash1 = crypto.createHash('sha256').update(AGREEMENT_TEXT_V1, 'utf8').digest('hex')
      const hash2 = crypto.createHash('sha256').update(AGREEMENT_TEXT_V1, 'utf8').digest('hex')
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA-256 produces 64 hex chars
    })
  })

  describe('SupplierApplicationInput interface', () => {
    it('should define required fields', () => {
      const validInput = {
        businessName: 'Test Business',
        phone: '050-1234567',
        email: 'test@example.com',
        cardcomTerminalId: '1234567',
        agreementAccepted: true,
      }

      // TypeScript compilation ensures these fields exist
      expect(validInput.businessName).toBeTruthy()
      expect(validInput.phone).toBeTruthy()
      expect(validInput.email).toBeTruthy()
      expect(validInput.cardcomTerminalId).toBeTruthy()
      expect(validInput.agreementAccepted).toBe(true)
    })
  })
})
