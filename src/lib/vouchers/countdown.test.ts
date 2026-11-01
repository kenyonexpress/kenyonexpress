import { describe, expect, it } from 'vitest'
import { fillTemplate, validityLabel, validityRemaining, validityTickMs } from './countdown'

const NOW = new Date('2026-10-05T10:00:00Z')
const at = (iso: string) => new Date(iso).getTime()

describe('validityRemaining', () => {
  it('splits the remaining time into days, hours, minutes and seconds', () => {
    expect(validityRemaining('2026-10-07T12:30:15Z', NOW)).toEqual({
      days: 2,
      hours: 2,
      minutes: 30,
      seconds: 15,
    })
  })

  it('is null at the deadline and after it, never negative', () => {
    expect(validityRemaining('2026-10-05T10:00:00Z', NOW)).toBeNull()
    expect(validityRemaining('2026-10-04T10:00:00Z', NOW)).toBeNull()
  })

  it('is null for an unparseable deadline, the safe direction for a QR screen', () => {
    expect(validityRemaining('not-a-date', NOW)).toBeNull()
    expect(validityRemaining('', NOW)).toBeNull()
  })

  it('accepts a Date, a number and an ISO string for either side', () => {
    const parts = validityRemaining(at('2026-10-05T10:00:30Z'), NOW.getTime())
    expect(parts).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 30 })
  })
})

describe('validityLabel', () => {
  it('reads days and hours while at least a day is left', () => {
    expect(validityLabel({ days: 2, hours: 3, minutes: 59, seconds: 59 })).toBe(
      'נותרו 2 ימים ו-3 שעות',
    )
  })

  it('steps down to hours and minutes inside the last day', () => {
    expect(validityLabel({ days: 0, hours: 5, minutes: 7, seconds: 0 })).toBe(
      'נותרו 5 שעות ו-7 דקות',
    )
  })

  it('steps down to minutes and seconds inside the last hour', () => {
    expect(validityLabel({ days: 0, hours: 0, minutes: 12, seconds: 4 })).toBe(
      'נותרו 12 דקות ו-4 שניות',
    )
  })

  it('says expired, in the same word the status chip uses, once nothing is left', () => {
    expect(validityLabel(null)).toBe('פג תוקף')
  })
})

describe('validityTickMs', () => {
  it('ticks once a minute until the last hour, then every second', () => {
    expect(validityTickMs({ days: 1, hours: 0, minutes: 0, seconds: 0 })).toBe(60_000)
    expect(validityTickMs({ days: 0, hours: 1, minutes: 0, seconds: 0 })).toBe(60_000)
    expect(validityTickMs({ days: 0, hours: 0, minutes: 59, seconds: 59 })).toBe(1000)
    expect(validityTickMs(null)).toBe(60_000)
  })
})

describe('fillTemplate', () => {
  it('fills known slots and leaves unknown ones as written', () => {
    expect(fillTemplate('{a} and {b} and {c}', { a: 1, b: 'two' })).toBe('1 and two and {c}')
  })
})
