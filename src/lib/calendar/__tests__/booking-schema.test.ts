import { describe, expect, it } from 'vitest'
import { calculateNights, hasDateOverlap, validateBookingDates } from '../booking-schema'

describe('calculateNights', () => {
  it('calculates nights correctly', () => {
    const checkIn = new Date('2026-06-01')
    const checkOut = new Date('2026-06-04')
    expect(calculateNights(checkIn, checkOut)).toBe(3)
  })

  it('handles single night', () => {
    const checkIn = new Date('2026-06-01')
    const checkOut = new Date('2026-06-02')
    expect(calculateNights(checkIn, checkOut)).toBe(1)
  })
})

describe('hasDateOverlap', () => {
  it('detects overlap when ranges intersect', () => {
    const checkIn1 = new Date('2026-06-01')
    const checkOut1 = new Date('2026-06-05')
    const checkIn2 = new Date('2026-06-03')
    const checkOut2 = new Date('2026-06-07')

    expect(hasDateOverlap(checkIn1, checkOut1, checkIn2, checkOut2)).toBe(true)
  })

  it('allows check-in on check-out day (no overlap)', () => {
    const checkIn1 = new Date('2026-06-01')
    const checkOut1 = new Date('2026-06-05')
    const checkIn2 = new Date('2026-06-05')
    const checkOut2 = new Date('2026-06-10')

    expect(hasDateOverlap(checkIn1, checkOut1, checkIn2, checkOut2)).toBe(false)
  })

  it('detects no overlap when ranges separate', () => {
    const checkIn1 = new Date('2026-06-01')
    const checkOut1 = new Date('2026-06-05')
    const checkIn2 = new Date('2026-06-10')
    const checkOut2 = new Date('2026-06-15')

    expect(hasDateOverlap(checkIn1, checkOut1, checkIn2, checkOut2)).toBe(false)
  })
})

describe('validateBookingDates', () => {
  it('rejects check-in in the past', () => {
    const checkIn = new Date('2020-01-01')
    const checkOut = new Date('2020-01-05')
    const result = validateBookingDates(checkIn, checkOut)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('future')
  })

  it('rejects check-out before or equal to check-in', () => {
    const checkIn = new Date('2030-06-05')
    const checkOut = new Date('2030-06-05')
    const result = validateBookingDates(checkIn, checkOut)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('after check-in')
  })

  it('rejects bookings over 365 nights', () => {
    const checkIn = new Date('2030-01-01')
    const checkOut = new Date('2031-01-03')
    const result = validateBookingDates(checkIn, checkOut)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('365')
  })

  it('accepts valid future dates', () => {
    const checkIn = new Date('2030-06-01')
    const checkOut = new Date('2030-06-05')
    const result = validateBookingDates(checkIn, checkOut)

    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })
})
