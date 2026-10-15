import { describe, expect, it } from 'vitest'
import { giftSendAt } from './send-at'

const now = new Date('2026-10-16T10:00:00Z')

describe('giftSendAt', () => {
  it('schedules a future date at 06:00 UTC', () => {
    expect(giftSendAt('2026-11-01', now)?.toISOString()).toBe('2026-11-01T06:00:00.000Z')
  })
  it('sends now for today, the past, nothing, or garbage', () => {
    for (const v of ['2026-10-16', '2026-10-01', '', null, undefined, 'tomorrow', '2026-02-31']) {
      expect(giftSendAt(v, now)).toBeNull()
    }
  })
  it('refuses more than a year ahead', () => {
    expect(giftSendAt('2028-01-01', now)).toBeNull()
  })
})
