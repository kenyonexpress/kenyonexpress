import { describe, expect, it } from 'vitest'
import { type Subscription, getNextBillingDate, isDueForRenewal } from '../subscription-schema'

describe('getNextBillingDate', () => {
  it('adds 1 month for monthly interval', () => {
    const date = new Date('2026-01-15')
    const next = getNextBillingDate(date, 'monthly')
    expect(next.getMonth()).toBe(1) // February (0-indexed)
    expect(next.getDate()).toBe(15)
  })

  it('adds 3 months for quarterly interval', () => {
    const date = new Date('2026-01-15')
    const next = getNextBillingDate(date, 'quarterly')
    expect(next.getMonth()).toBe(3) // April
    expect(next.getDate()).toBe(15)
  })

  it('adds 1 year for annual interval', () => {
    const date = new Date('2026-01-15')
    const next = getNextBillingDate(date, 'annual')
    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(0) // January
    expect(next.getDate()).toBe(15)
  })
})

describe('isDueForRenewal', () => {
  const baseSubscription: Subscription = {
    id: '123',
    productId: '456',
    userId: '789',
    interval: 'monthly',
    status: 'active',
    currentPeriodStart: new Date('2026-01-01'),
    currentPeriodEnd: new Date('2026-01-31'),
    priceAgorot: 10000,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    cancelledAt: null,
  }

  it('returns false for non-active subscription', () => {
    const sub = { ...baseSubscription, status: 'cancelled' as const }
    expect(isDueForRenewal(sub)).toBe(false)
  })

  it('returns false when period not ended', () => {
    const sub = {
      ...baseSubscription,
      currentPeriodEnd: new Date(Date.now() + 86400000), // Tomorrow
    }
    expect(isDueForRenewal(sub)).toBe(false)
  })

  it('returns true when period ended and active', () => {
    const sub = {
      ...baseSubscription,
      currentPeriodEnd: new Date(Date.now() - 86400000), // Yesterday
    }
    expect(isDueForRenewal(sub)).toBe(true)
  })
})
