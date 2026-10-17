import { describe, expect, it } from 'vitest'
import {
  calculateCombinedRiskScore,
  detectChargebackRisk,
  detectImpossibleGeography,
  detectNewProfileHighValue,
  detectVelocityAbuse,
  determineRiskLevel,
  shouldAutoFlag,
} from '../detector'
import type { FraudSignal } from '../detector'

describe('Fraud Detection', () => {
  describe('detectImpossibleGeography', () => {
    it('should detect cross-border high-value order', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 50000, // 500₪
        deliveryCountry: 'IL',
        deliveryCity: 'Tel Aviv',
        createdAt: new Date(),
      }

      const signal = await detectImpossibleGeography(order, 'US')

      expect(signal).not.toBeNull()
      expect(signal?.signalType).toBe('impossible_geography')
      expect(signal?.severity).toBe('medium')
      expect(signal?.score).toBeGreaterThanOrEqual(0.6)
    })

    it('should ignore domestic orders', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 50000,
        deliveryCountry: 'IL',
        deliveryCity: 'Tel Aviv',
        createdAt: new Date(),
      }

      const signal = await detectImpossibleGeography(order, 'IL')

      expect(signal).toBeNull()
    })

    it('should ignore low-value international orders', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000, // 100₪
        deliveryCountry: 'IL',
        deliveryCity: 'Tel Aviv',
        createdAt: new Date(),
      }

      const signal = await detectImpossibleGeography(order, 'US')

      expect(signal).toBeNull()
    })

    it('should handle missing location data', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 50000,
        deliveryCountry: 'IL',
        deliveryCity: 'Tel Aviv',
        createdAt: new Date(),
      }

      const signal = await detectImpossibleGeography(order, undefined)

      expect(signal).toBeNull()
    })
  })

  describe('detectVelocityAbuse', () => {
    it('should detect high order frequency', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000,
        createdAt: new Date(),
      }

      const signal = await detectVelocityAbuse(order, 8)

      expect(signal).not.toBeNull()
      expect(signal?.signalType).toBe('velocity_abuse')
      expect(signal?.severity).toBe('high')
    })

    it('should mark critical velocity for extreme cases', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000,
        createdAt: new Date(),
      }

      const signal = await detectVelocityAbuse(order, 12)

      expect(signal?.severity).toBe('critical')
      expect(signal?.score).toBeGreaterThan(0.7)
    })

    it('should ignore normal order frequency', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000,
        createdAt: new Date(),
      }

      const signal = await detectVelocityAbuse(order, 3)

      expect(signal).toBeNull()
    })

    it('should scale score with order count', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000,
        createdAt: new Date(),
      }

      const signal6 = await detectVelocityAbuse(order, 6)
      const signal10 = await detectVelocityAbuse(order, 10)

      expect(signal6?.score).toBeLessThan(signal10?.score || 0)
    })
  })

  describe('detectChargebackRisk', () => {
    it('should detect profile with chargeback history', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000,
        createdAt: new Date(),
      }

      const signal = await detectChargebackRisk(order, 2)

      expect(signal).not.toBeNull()
      expect(signal?.signalType).toBe('chargeback_risk')
      expect(signal?.severity).toBe('high')
    })

    it('should mark critical for multiple chargebacks', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000,
        createdAt: new Date(),
      }

      const signal = await detectChargebackRisk(order, 4)

      expect(signal?.severity).toBe('critical')
      expect(signal?.score).toBeGreaterThan(0.8)
    })

    it('should ignore clean profiles', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000,
        createdAt: new Date(),
      }

      const signal = await detectChargebackRisk(order, 0)

      expect(signal).toBeNull()
    })
  })

  describe('detectNewProfileHighValue', () => {
    it('should detect new profile with high-value order', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 50000,
        createdAt: new Date(),
      }

      const profile = {
        id: 'profile-1',
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      }

      const signal = await detectNewProfileHighValue(order, profile)

      expect(signal).not.toBeNull()
      expect(signal?.signalType).toBe('new_profile_high_value')
      expect(signal?.severity).toBe('high')
    })

    it('should ignore established profiles', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 50000,
        createdAt: new Date(),
      }

      const profile = {
        id: 'profile-1',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      }

      const signal = await detectNewProfileHighValue(order, profile)

      expect(signal).toBeNull()
    })

    it('should ignore new profiles with normal orders', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 10000,
        createdAt: new Date(),
      }

      const profile = {
        id: 'profile-1',
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      }

      const signal = await detectNewProfileHighValue(order, profile)

      expect(signal).toBeNull()
    })

    it('should respect custom high-value threshold', async () => {
      const order = {
        id: 'test-order-1',
        profileId: 'profile-1',
        amount: 30000,
        createdAt: new Date(),
      }

      const profile = {
        id: 'profile-1',
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      }

      const signal = await detectNewProfileHighValue(order, profile, 25000)

      expect(signal).not.toBeNull()
      expect(signal?.signalType).toBe('new_profile_high_value')
    })
  })

  describe('calculateCombinedRiskScore', () => {
    it('should return 0 for empty signal list', () => {
      const score = calculateCombinedRiskScore([])
      expect(score).toBe(0)
    })

    it('should sum individual scores', () => {
      const signals: FraudSignal[] = [
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'velocity_abuse',
          severity: 'medium',
          score: 0.5,
        },
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'chargeback_risk',
          severity: 'medium',
          score: 0.3,
        },
      ]

      const score = calculateCombinedRiskScore(signals)
      expect(score).toBe(0.8)
    })

    it('should cap score at 1.0', () => {
      const signals: FraudSignal[] = [
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'velocity_abuse',
          severity: 'critical',
          score: 0.7,
        },
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'chargeback_risk',
          severity: 'critical',
          score: 0.8,
        },
      ]

      const score = calculateCombinedRiskScore(signals)
      expect(score).toBe(1.0)
    })
  })

  describe('shouldAutoFlag', () => {
    it('should auto-flag when combined score >= 0.60', () => {
      const signals: FraudSignal[] = [
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'velocity_abuse',
          severity: 'medium',
          score: 0.4,
        },
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'chargeback_risk',
          severity: 'medium',
          score: 0.25,
        },
      ]

      const shouldFlag = shouldAutoFlag(signals)
      expect(shouldFlag).toBe(true)
    })

    it('should not auto-flag when combined score < 0.60', () => {
      const signals: FraudSignal[] = [
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'velocity_abuse',
          severity: 'low',
          score: 0.3,
        },
      ]

      const shouldFlag = shouldAutoFlag(signals)
      expect(shouldFlag).toBe(false)
    })

    it('should auto-flag if any signal is critical', () => {
      const signals: FraudSignal[] = [
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'velocity_abuse',
          severity: 'critical',
          score: 0.9,
        },
      ]

      const shouldFlag = shouldAutoFlag(signals)
      expect(shouldFlag).toBe(true)
    })

    it('should not flag empty signal list', () => {
      const shouldFlag = shouldAutoFlag([])
      expect(shouldFlag).toBe(false)
    })
  })

  describe('determineRiskLevel', () => {
    it('should return critical for critical signals', () => {
      const signals: FraudSignal[] = [
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'velocity_abuse',
          severity: 'critical',
          score: 0.9,
        },
      ]

      const level = determineRiskLevel(signals)
      expect(level).toBe('critical')
    })

    it('should return high for multiple high signals', () => {
      const signals: FraudSignal[] = [
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'velocity_abuse',
          severity: 'high',
          score: 0.7,
        },
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'chargeback_risk',
          severity: 'high',
          score: 0.6,
        },
      ]

      const level = determineRiskLevel(signals)
      expect(level).toBe('high')
    })

    it('should return medium for single medium signal', () => {
      const signals: FraudSignal[] = [
        {
          orderId: 'order-1',
          profileId: 'profile-1',
          signalType: 'impossible_geography',
          severity: 'medium',
          score: 0.5,
        },
      ]

      const level = determineRiskLevel(signals)
      expect(level).toBe('medium')
    })

    it('should return low for no signals', () => {
      const level = determineRiskLevel([])
      expect(level).toBe('low')
    })
  })
})
