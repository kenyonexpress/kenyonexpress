import { describe, expect, it } from 'vitest'
import { GIFT_CARD_VALIDITY_YEARS, giftCardExpiryFromIssue, judgeGiftCard } from './gift-card'

const NOW = new Date('2026-09-10T12:00:00Z')

describe('judgeGiftCard', () => {
  it('an issued, unexpired card is active at face value', () => {
    const out = judgeGiftCard(
      { amount_agorot: 15_000, status: 'issued', expires_at: '2031-09-10T12:00:00Z' },
      NOW,
    )
    expect(out.state).toBe('active')
    expect(out.balanceAgorot).toBe(15_000)
  })

  it('a redeemed card holds zero, even before its expiry', () => {
    const out = judgeGiftCard(
      { amount_agorot: 15_000, status: 'redeemed', expires_at: '2031-09-10T12:00:00Z' },
      NOW,
    )
    expect(out.state).toBe('redeemed')
    expect(out.balanceAgorot).toBe(0)
  })

  it('status wins over the clock: redeemed then lapsed reads redeemed', () => {
    const out = judgeGiftCard(
      { amount_agorot: 15_000, status: 'redeemed', expires_at: '2026-01-01T00:00:00Z' },
      NOW,
    )
    expect(out.state).toBe('redeemed')
  })

  it('an issued card past expires_at is expired and worth zero', () => {
    const out = judgeGiftCard(
      { amount_agorot: 15_000, status: 'issued', expires_at: '2026-09-10T11:59:59Z' },
      NOW,
    )
    expect(out.state).toBe('expired')
    expect(out.balanceAgorot).toBe(0)
  })

  it('expiry is exclusive at the boundary instant, matching the RPC (<=)', () => {
    const out = judgeGiftCard(
      { amount_agorot: 100, status: 'issued', expires_at: NOW.toISOString() },
      NOW,
    )
    expect(out.state).toBe('expired')
  })

  it('a cancelled card is cancelled whatever the dates say', () => {
    const out = judgeGiftCard(
      { amount_agorot: 100, status: 'cancelled', expires_at: '2031-01-01T00:00:00Z' },
      NOW,
    )
    expect(out.state).toBe('cancelled')
    expect(out.balanceAgorot).toBe(0)
  })
})

describe('giftCardExpiryFromIssue', () => {
  it('stamps the statutory five calendar years', () => {
    expect(GIFT_CARD_VALIDITY_YEARS).toBe(5)
    const out = giftCardExpiryFromIssue(new Date('2026-09-10T12:00:00Z'))
    expect(out.toISOString()).toBe('2031-09-10T12:00:00.000Z')
  })

  it('a leap-day purchase errs long, never short', () => {
    const out = giftCardExpiryFromIssue(new Date('2028-02-29T00:00:00Z'))
    // 2033 has no 29.02; the roll lands on 01.03, one day MORE validity.
    expect(out.getTime()).toBeGreaterThan(new Date('2033-02-28T00:00:00Z').getTime())
  })
})
