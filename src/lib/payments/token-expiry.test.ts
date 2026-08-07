import { describe, expect, it } from 'vitest'
import { isCardTokenExpired } from './token-expiry'

const MID_JULY_2026 = new Date('2026-07-27T08:00:00.000Z')

describe('isCardTokenExpired', () => {
  it('keeps a card valid through the whole of its stated month', () => {
    // 07/26 during July 2026: still good, this is the off-by-one that matters.
    expect(isCardTokenExpired(7, 2026, MID_JULY_2026)).toBe(false)
    expect(isCardTokenExpired(7, 2026, new Date('2026-07-31T23:59:59.000Z'))).toBe(false)
    expect(isCardTokenExpired(7, 2026, new Date('2026-08-01T00:00:00.000Z'))).toBe(true)
  })

  it('expires a card whose month has passed', () => {
    expect(isCardTokenExpired(6, 2026, MID_JULY_2026)).toBe(true)
    expect(isCardTokenExpired(12, 2025, MID_JULY_2026)).toBe(true)
  })

  it('accepts a future card', () => {
    expect(isCardTokenExpired(1, 2027, MID_JULY_2026)).toBe(false)
  })

  it('rolls December into the next January instead of month 13', () => {
    expect(isCardTokenExpired(12, 2026, new Date('2026-12-31T23:00:00.000Z'))).toBe(false)
    expect(isCardTokenExpired(12, 2026, new Date('2027-01-01T00:00:00.000Z'))).toBe(true)
  })

  it('reads a two-digit year the way Cardcom sometimes reports it', () => {
    expect(isCardTokenExpired(7, 26, MID_JULY_2026)).toBe(false)
    expect(isCardTokenExpired(6, 26, MID_JULY_2026)).toBe(true)
  })

  it('treats missing or nonsense dates as not expired, leaving the call to Cardcom', () => {
    expect(isCardTokenExpired(null, 2026, MID_JULY_2026)).toBe(false)
    expect(isCardTokenExpired(7, null, MID_JULY_2026)).toBe(false)
    expect(isCardTokenExpired(undefined, undefined, MID_JULY_2026)).toBe(false)
    expect(isCardTokenExpired(0, 2026, MID_JULY_2026)).toBe(false)
    expect(isCardTokenExpired(13, 2026, MID_JULY_2026)).toBe(false)
    expect(isCardTokenExpired(7.5, 2026, MID_JULY_2026)).toBe(false)
  })
})
