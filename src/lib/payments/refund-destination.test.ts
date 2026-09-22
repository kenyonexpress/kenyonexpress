import { describe, expect, it } from 'vitest'
import {
  DISTANCE_SALE_WINDOW_DAYS,
  israelCalendarDaysBetween,
  selectRefundDestination,
} from './refund-destination'

const CHARGE = new Date('2026-09-01T10:00:00+03:00')

describe('israelCalendarDaysBetween', () => {
  it('is zero on the same Israel calendar day, even across UTC midnight', () => {
    const late = new Date('2026-09-01T23:50:00+03:00')
    expect(israelCalendarDaysBetween(CHARGE, late)).toBe(0)
  })

  it('counts a next-morning Israel day as one, not as elapsed hours', () => {
    const nextMorning = new Date('2026-09-02T00:10:00+03:00')
    expect(israelCalendarDaysBetween(CHARGE, nextMorning)).toBe(1)
  })
})

describe('selectRefundDestination', () => {
  it('returns original_method inside the 14-day window', () => {
    const day14 = new Date('2026-09-15T18:00:00+03:00')
    expect(israelCalendarDaysBetween(CHARGE, day14)).toBe(DISTANCE_SALE_WINDOW_DAYS)
    expect(selectRefundDestination({ chargedAt: CHARGE, now: day14, voucherConsumed: false })).toBe(
      'original_method',
    )
  })

  it('returns wallet the calendar day after the window closes', () => {
    const day15 = new Date('2026-09-16T00:10:00+03:00')
    expect(selectRefundDestination({ chargedAt: CHARGE, now: day15, voucherConsumed: false })).toBe(
      'wallet',
    )
  })

  it('returns wallet when a voucher was consumed, even inside the window', () => {
    const sameDay = new Date('2026-09-01T16:00:00+03:00')
    expect(
      selectRefundDestination({ chargedAt: CHARGE, now: sameDay, voucherConsumed: true }),
    ).toBe('wallet')
  })
})
