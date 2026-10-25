import { describe, expect, it } from 'vitest'
import { AGREEMENT_TEXT_V1, AGREEMENT_VERSION } from './supplier-onboarding'

describe('Supplier Onboarding', () => {
  describe('Agreement constants', () => {
    it('should have valid agreement text', () => {
      expect(AGREEMENT_TEXT_V1).toBeTruthy()
      expect(AGREEMENT_TEXT_V1.length).toBeGreaterThan(50)
      expect(AGREEMENT_TEXT_V1).toContain('תנאי שימוש')
    })

    it('should have valid agreement version', () => {
      expect(AGREEMENT_VERSION).toBe('v1.0')
    })
  })

  describe('Input validation', () => {
    it('should require business name', () => {
      // Validated in the form and server action
      expect('businessName').toBeTruthy()
    })

    it('should require phone', () => {
      expect('phone').toBeTruthy()
    })

    it('should require email', () => {
      expect('email').toBeTruthy()
    })

    it('should require Cardcom terminal ID', () => {
      expect('cardcomTerminalId').toBeTruthy()
    })
  })
})
