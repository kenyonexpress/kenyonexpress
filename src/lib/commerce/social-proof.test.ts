import {
  BOUGHT_THIS_WEEK_FLOOR,
  PAID_ORDER_STATUSES,
  WEEK_MS,
  boughtThisWeekMessage,
  sumRealUnits,
  weekWindowStart,
} from '@/lib/commerce/social-proof'
import { describe, expect, it } from 'vitest'

describe('boughtThisWeekMessage', () => {
  it('says nothing under the floor, and nothing is not a rounded-up number', () => {
    expect(boughtThisWeekMessage(0)).toBeNull()
    expect(boughtThisWeekMessage(1)).toBeNull()
    expect(boughtThisWeekMessage(BOUGHT_THIS_WEEK_FLOOR - 1)).toBeNull()
  })

  it('states the exact count from the floor up, in Hebrew', () => {
    const line = boughtThisWeekMessage(BOUGHT_THIS_WEEK_FLOOR)
    expect(line).toContain(String(BOUGHT_THIS_WEEK_FLOOR))
    expect(line).toContain('השבוע')
    expect(boughtThisWeekMessage(41)).toContain('41')
  })

  it('refuses a non-integer count rather than printing 3.5', () => {
    expect(boughtThisWeekMessage(3.5)).toBeNull()
    expect(boughtThisWeekMessage(Number.NaN)).toBeNull()
  })
})

describe('sumRealUnits', () => {
  const items = [
    { order_id: 'real-1', quantity: 2 },
    { order_id: 'mock-1', quantity: 18 },
    { order_id: 'real-2', quantity: 1 },
    { order_id: 'real-3', quantity: 0 },
    { order_id: 'real-4', quantity: 1.5 },
  ]

  it('counts only units on orders backed by a real charge', () => {
    // The production shape on 2026-09-25: the mock order carries the big
    // number, and the line must not repeat it.
    expect(sumRealUnits(items, new Set(['real-1', 'real-2', 'real-3', 'real-4']))).toBe(3)
  })

  it('is zero when no order was really charged', () => {
    expect(sumRealUnits(items, new Set())).toBe(0)
  })
})

describe('the window', () => {
  it('is seven days back from the clock it is given', () => {
    const now = new Date('2026-09-25T12:00:00.000Z')
    expect(weekWindowStart(now)).toBe('2026-09-18T12:00:00.000Z')
    expect(WEEK_MS).toBe(7 * 86_400_000)
  })

  it('counts money taken and kept, never refunded or cancelled', () => {
    expect(PAID_ORDER_STATUSES).not.toContain('refunded')
    expect(PAID_ORDER_STATUSES).not.toContain('cancelled')
    expect(PAID_ORDER_STATUSES).not.toContain('pending')
    expect(PAID_ORDER_STATUSES).toContain('paid')
  })
})
