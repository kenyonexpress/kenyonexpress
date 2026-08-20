import { describe, expect, it } from 'vitest'
import {
  COUNTDOWN_URGENT_HOURS,
  COUNTDOWN_VISIBLE_DAYS,
  countdownLabel,
  countdownState,
} from './CountdownTimer'

const NOW = Date.parse('2026-08-20T09:00:00.000Z')
const inMs = (ms: number) => new Date(NOW + ms).toISOString()
const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('countdownState', () => {
  it('hides when there is no deadline', () => {
    expect(countdownState(null, NOW)).toEqual({ kind: 'hidden' })
    expect(countdownState(undefined, NOW)).toEqual({ kind: 'hidden' })
    expect(countdownState('not a date', NOW)).toEqual({ kind: 'hidden' })
  })

  it(`hides further out than ${COUNTDOWN_VISIBLE_DAYS} days`, () => {
    expect(countdownState(inMs(COUNTDOWN_VISIBLE_DAYS * DAY + HOUR), NOW).kind).toBe('hidden')
    expect(countdownState(inMs(COUNTDOWN_VISIBLE_DAYS * DAY - HOUR), NOW).kind).toBe('live')
  })

  it('reports ended on and after the deadline', () => {
    expect(countdownState(inMs(0), NOW).kind).toBe('ended')
    expect(countdownState(inMs(-1), NOW).kind).toBe('ended')
  })

  it('splits the remainder into days, hours and minutes', () => {
    expect(countdownState(inMs(3 * DAY + 5 * HOUR + 7 * 60_000), NOW)).toEqual({
      kind: 'live',
      days: 3,
      hours: 5,
      minutes: 7,
      urgent: false,
    })
  })

  it(`turns urgent strictly inside ${COUNTDOWN_URGENT_HOURS} hours`, () => {
    expect(countdownState(inMs(COUNTDOWN_URGENT_HOURS * HOUR), NOW)).toMatchObject({
      urgent: false,
    })
    expect(countdownState(inMs(COUNTDOWN_URGENT_HOURS * HOUR - 1), NOW)).toMatchObject({
      urgent: true,
    })
  })

  it('is timezone independent: the same instant either side of a UTC offset', () => {
    const utc = countdownState('2026-08-22T12:00:00.000Z', NOW)
    const withOffset = countdownState('2026-08-22T15:00:00.000+03:00', NOW)
    expect(withOffset).toEqual(utc)
  })
})

describe('countdownLabel', () => {
  it('renders nothing when hidden or ended', () => {
    expect(countdownLabel({ kind: 'hidden' })).toBeNull()
    expect(countdownLabel({ kind: 'ended' })).toBeNull()
  })

  it('uses the Hebrew singular and dual forms', () => {
    expect(countdownLabel(countdownState(inMs(DAY + HOUR), NOW))).toBe('נותרו יום ושעה')
    expect(countdownLabel(countdownState(inMs(2 * DAY + 2 * HOUR), NOW))).toBe(
      'נותרו יומיים ושעתיים',
    )
    expect(countdownLabel(countdownState(inMs(3 * DAY + 5 * HOUR), NOW))).toBe(
      'נותרו 3 ימים ו-5 שעות',
    )
  })

  it('drops the hours when the remainder is whole days', () => {
    expect(countdownLabel(countdownState(inMs(4 * DAY + 30_000), NOW))).toBe('נותרו 4 ימים')
  })

  it('counts in hours and minutes once inside the last day', () => {
    expect(countdownLabel(countdownState(inMs(5 * HOUR + 12 * 60_000), NOW))).toBe(
      'נותרו 5 שעות ו-12 דקות',
    )
    expect(countdownLabel(countdownState(inMs(45 * 60_000), NOW))).toBe('נותרו 45 דקות')
  })
})
