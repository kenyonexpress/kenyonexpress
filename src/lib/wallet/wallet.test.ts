import { describe, expect, it } from 'vitest'
import { formatPayoutMethod, formatPayoutStatus, formatWalletAmount } from './display'

describe('wallet display utilities', () => {
  describe('formatWalletAmount', () => {
    it('formats agorot to ILS currency', () => {
      expect(formatWalletAmount(5000)).toContain('50.00')
      expect(formatWalletAmount(5000)).toContain('₪')
      expect(formatWalletAmount(12345)).toContain('123.45')
      expect(formatWalletAmount(100)).toContain('1.00')
    })
  })

  describe('formatPayoutStatus', () => {
    it('returns Hebrew label for pending', () => {
      expect(formatPayoutStatus('pending')).toBe('ממתין לאישור')
    })

    it('returns Hebrew label for approved', () => {
      expect(formatPayoutStatus('approved')).toBe('אושר')
    })

    it('returns Hebrew label for completed', () => {
      expect(formatPayoutStatus('completed')).toBe('הושלם')
    })

    it('returns Hebrew label for rejected', () => {
      expect(formatPayoutStatus('rejected')).toBe('נדחה')
    })
  })

  describe('formatPayoutMethod', () => {
    it('returns Hebrew label for bank transfer', () => {
      expect(formatPayoutMethod('bank_transfer')).toBe('העברה בנקאית')
    })

    it('returns Hebrew label for cardcom refund', () => {
      expect(formatPayoutMethod('cardcom_refund')).toBe('החזר לכרטיס')
    })
  })
})
