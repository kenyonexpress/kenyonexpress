import { describe, expect, it } from 'vitest'
import {
  QUIET_HOURS_EXEMPT_KINDS,
  deferForQuietHours,
  isQuietHour,
  israelClock,
  israelLocalToUtc,
  quietHoursEnd,
} from './quiet-hours'

/**
 * Every instant below is written in UTC and annotated with the Israel wall
 * clock it corresponds to. Israel is UTC+2 in winter and UTC+3 in summer; in
 * 2026 the clocks go forward on Friday 27 March at 02:00 and back on Sunday
 * 25 October at 02:00. The two nights around those changes are the cases a
 * fixed-offset implementation gets wrong by an hour, which is why they are
 * here by date.
 */

const at = (iso: string) => new Date(iso)

describe('the Israel wall clock', () => {
  it('reads UTC+2 in winter', () => {
    const c = israelClock(at('2026-01-15T20:00:00Z'))
    expect([c.year, c.month, c.day, c.hour, c.minute]).toEqual([2026, 1, 15, 22, 0])
  })

  it('reads UTC+3 in summer', () => {
    const c = israelClock(at('2026-07-15T19:00:00Z'))
    expect([c.month, c.day, c.hour]).toEqual([7, 15, 22])
  })

  it('uses a 23-hour clock, so midnight is 0 and not 24', () => {
    expect(israelClock(at('2026-01-15T22:00:00Z')).hour).toBe(0)
  })
})

describe('the window', () => {
  it('opens at exactly 22:00 Israel time in winter', () => {
    expect(isQuietHour(at('2026-01-15T19:59:59Z'))).toBe(false) // 21:59:59
    expect(isQuietHour(at('2026-01-15T20:00:00Z'))).toBe(true) // 22:00:00
  })

  it('closes at exactly 08:00, which is already daytime', () => {
    expect(isQuietHour(at('2026-01-16T05:59:59Z'))).toBe(true) // 07:59:59
    expect(isQuietHour(at('2026-01-16T06:00:00Z'))).toBe(false) // 08:00:00
  })

  it('follows the clock into summer time', () => {
    // 19:59Z is 21:59 in July and would have been 22:59 in January.
    expect(isQuietHour(at('2026-07-15T18:59:59Z'))).toBe(false)
    expect(isQuietHour(at('2026-07-15T19:00:00Z'))).toBe(true)
    expect(isQuietHour(at('2026-07-16T04:59:59Z'))).toBe(true) // 07:59:59 IDT
    expect(isQuietHour(at('2026-07-16T05:00:00Z'))).toBe(false) // 08:00:00 IDT
  })

  it('covers the whole night, not just the two edges', () => {
    expect(isQuietHour(at('2026-01-15T22:00:00Z'))).toBe(true) // 00:00
    expect(isQuietHour(at('2026-01-16T01:30:00Z'))).toBe(true) // 03:30
    expect(isQuietHour(at('2026-01-16T10:00:00Z'))).toBe(false) // 12:00
  })
})

describe('when the window closes', () => {
  it('is 08:00 tomorrow for a push that arrives after 22:00', () => {
    // 22:00 IST on the 15th -> 08:00 IST on the 16th -> 06:00Z.
    expect(quietHoursEnd(at('2026-01-15T20:00:00Z')).toISOString()).toBe('2026-01-16T06:00:00.000Z')
  })

  it('is 08:00 today for a push that arrives in the small hours', () => {
    // 05:00 IST on the 16th -> 08:00 IST the same day.
    expect(quietHoursEnd(at('2026-01-16T03:00:00Z')).toISOString()).toBe('2026-01-16T06:00:00.000Z')
  })

  it('is 08:00 summer time in summer', () => {
    // 02:30 IDT on 16 July -> 08:00 IDT -> 05:00Z.
    expect(quietHoursEnd(at('2026-07-15T23:30:00Z')).toISOString()).toBe('2026-07-16T05:00:00.000Z')
  })

  it('rolls over the month boundary', () => {
    // 23:00 IST on 31 January -> 08:00 IST on 1 February.
    expect(quietHoursEnd(at('2026-01-31T21:00:00Z')).toISOString()).toBe('2026-02-01T06:00:00.000Z')
  })

  it('lands on the morning clock on the night summer time ends', () => {
    // Saturday 24 October, 23:00 IDT (UTC+3). At 02:00 the clocks go back to
    // UTC+2, so 08:00 on Sunday is 06:00Z and not 05:00Z. A fixed +3 would
    // release the push at 07:00 local.
    expect(quietHoursEnd(at('2026-10-24T20:00:00Z')).toISOString()).toBe('2026-10-25T06:00:00.000Z')
  })

  it('lands on the morning clock on the night summer time begins', () => {
    // Thursday 26 March, 23:00 IST (UTC+2). At 02:00 Friday the clocks go
    // forward to UTC+3, so 08:00 on Friday is 05:00Z. A fixed +2 would release
    // the push at 09:00 local.
    expect(quietHoursEnd(at('2026-03-26T21:00:00Z')).toISOString()).toBe('2026-03-27T05:00:00.000Z')
  })

  it('refuses to be asked during the day', () => {
    expect(() => quietHoursEnd(at('2026-01-15T10:00:00Z'))).toThrow(/outside the window/)
  })
})

describe('israelLocalToUtc', () => {
  it('converts a winter wall clock', () => {
    expect(israelLocalToUtc(2026, 1, 15, 8).toISOString()).toBe('2026-01-15T06:00:00.000Z')
  })

  it('converts a summer wall clock', () => {
    expect(israelLocalToUtc(2026, 7, 15, 8, 30).toISOString()).toBe('2026-07-15T05:30:00.000Z')
  })
})

describe('the decision the drain asks for', () => {
  const night = at('2026-01-15T21:00:00Z') // 23:00 IST
  const day = at('2026-01-15T10:00:00Z') // 12:00 IST

  it('sends during the day', () => {
    expect(deferForQuietHours('price_drop', day)).toBeNull()
    expect(deferForQuietHours('order_shipped', day)).toBeNull()
  })

  it('holds a price drop, a delivery and a cashback credit until 08:00', () => {
    for (const kind of ['price_drop', 'order_delivered', 'order_shipped', 'cashback_credited']) {
      expect(deferForQuietHours(kind, night)?.toISOString(), kind).toBe('2026-01-16T06:00:00.000Z')
    }
  })

  it('lets the coupon somebody just paid for through at any hour', () => {
    // The customer is awake and holding the phone; the push is the receipt
    // for what they just did, and holding it would read as a failed purchase.
    expect(deferForQuietHours('voucher_issued', night)).toBeNull()
  })

  it('exempts exactly one kind, pinned by name', () => {
    // The list grows by somebody deciding a message is "urgent", which is not
    // the test. The test is whether the customer is the one who just acted.
    expect([...QUIET_HOURS_EXEMPT_KINDS]).toEqual(['voucher_issued'])
  })

  it('does not care about the server clock', () => {
    // 23:00 in Israel is 21:00 in London and 16:00 in New York; the answer is
    // the same wherever the function runs because it never reads the local
    // zone. process.env.TZ in vitest is whatever the laptop has.
    expect(deferForQuietHours('price_drop', night)).not.toBeNull()
  })
})
