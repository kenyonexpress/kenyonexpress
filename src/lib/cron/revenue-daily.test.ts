import { describe, expect, it } from 'vitest'
import { previousIsraelDay } from './revenue-daily'

describe('previousIsraelDay', () => {
  it('uses the Israel date, not UTC', () => {
    // 22:30 UTC on 2026-01-10 is 00:30 on 01-11 in Israel (winter, UTC+2)
    expect(previousIsraelDay(new Date('2026-01-10T22:30:00Z'))).toBe('2026-01-10')
  })
  it('handles summer time and month boundaries', () => {
    expect(previousIsraelDay(new Date('2026-07-31T21:30:00Z'))).toBe('2026-07-31')
    expect(previousIsraelDay(new Date('2026-08-01T10:00:00Z'))).toBe('2026-07-31')
  })
})
