import { describe, expect, it } from 'vitest'
import {
  MAX_BUSINESS_DAYS,
  MIN_BUSINESS_DAYS,
  addBusinessDays,
  estimateDelivery,
  holidaysModelled,
} from './estimate'

const NOW = new Date('2026-09-02T09:00:00.000Z')

describe('addBusinessDays', () => {
  it('never counts the starting day, per the terms', () => {
    // Sunday 2026-09-06 + 1 business day = Monday the 7th.
    expect(
      addBusinessDays(new Date('2026-09-06T00:00:00.000Z'), 1).toISOString().slice(0, 10),
    ).toBe('2026-09-07')
  })

  it('skips Friday and Saturday', () => {
    // Thursday 2026-09-10 + 1 = Sunday the 13th, not Friday the 11th.
    expect(
      addBusinessDays(new Date('2026-09-10T00:00:00.000Z'), 1).toISOString().slice(0, 10),
    ).toBe('2026-09-13')
  })

  it('walks over a whole weekend when the window spans one', () => {
    // Wednesday 2026-09-09 + 3 = Sun 13th (Thu 10, Sun 13 is 2 -> Mon 14).
    expect(
      addBusinessDays(new Date('2026-09-09T00:00:00.000Z'), 3).toISOString().slice(0, 10),
    ).toBe('2026-09-14')
  })

  it('ignores the time of day, keeping the result a date', () => {
    const late = addBusinessDays(new Date('2026-09-06T23:59:00.000Z'), 1)
    expect(late.toISOString()).toBe('2026-09-07T00:00:00.000Z')
  })
})

describe('estimateDelivery', () => {
  it('returns nothing for an unpaid order: the clock has not started', () => {
    expect(estimateDelivery({ paidAt: null, delivered: false, now: NOW })).toBeNull()
  })

  it('returns nothing once delivered', () => {
    expect(
      estimateDelivery({ paidAt: '2026-09-01T08:00:00.000Z', delivered: true, now: NOW }),
    ).toBeNull()
  })

  it('gives the 3-7 business day window from the payment', () => {
    // Paid Tuesday 2026-09-01. +3 business = Sunday the 6th, +7 = Thursday the 10th.
    const estimate = estimateDelivery({
      paidAt: '2026-09-01T08:00:00.000Z',
      delivered: false,
      now: NOW,
    })
    expect(estimate?.fromDate).toBe('2026-09-06')
    expect(estimate?.toDate).toBe('2026-09-10')
    expect(estimate?.labelHe).toContain('עד')
    expect(estimate?.overdue).toBe(false)
  })

  it('flags overdue only after the last day has passed', () => {
    const paidAt = '2026-09-01T08:00:00.000Z'
    expect(
      estimateDelivery({ paidAt, delivered: false, now: new Date('2026-09-10T23:00:00.000Z') })
        ?.overdue,
    ).toBe(false)
    expect(
      estimateDelivery({ paidAt, delivered: false, now: new Date('2026-09-11T06:00:00.000Z') })
        ?.overdue,
    ).toBe(true)
  })

  it('survives a garbage timestamp instead of printing "Invalid Date"', () => {
    expect(estimateDelivery({ paidAt: 'not-a-date', delivered: false, now: NOW })).toBeNull()
  })

  it('holds the window to what the product page promises', () => {
    expect(MIN_BUSINESS_DAYS).toBe(3)
    expect(MAX_BUSINESS_DAYS).toBe(7)
  })

  it('still admits that holidays are not modelled', () => {
    // The flag is the contract with the UI: while it is false the page must say
    // "הערכה". Flipping it without a holiday calendar is the failure this guards.
    expect(holidaysModelled).toBe(false)
  })
})
