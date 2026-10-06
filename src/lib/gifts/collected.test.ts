import { isGiftedAway } from '@/server/payments/voucher-email'
import { describe, expect, it } from 'vitest'
import { giftWasCollected } from './collected'

const BUYER = 'buyer-1'
const RECIPIENT = 'recipient-2'

describe('giftWasCollected', () => {
  it('is true once the claim moved the voucher to another account', () => {
    expect(
      giftWasCollected({ user_id: RECIPIENT, gift_claimed_at: '2026-10-05T08:00:00Z' }, BUYER),
    ).toBe(true)
  })

  it("is false while the link is out and the voucher is still the buyer's", () => {
    const row = { user_id: BUYER, gift_claimed_at: null, gift_claim_token_hash: 'abc' }
    expect(giftWasCollected(row, BUYER)).toBe(false)
    // That state is the HELD one, and the two rules never overlap.
    expect(isGiftedAway(row)).toBe(true)
  })

  it('is false for an ordinary coupon the buyer still holds', () => {
    expect(giftWasCollected({ user_id: BUYER, gift_claimed_at: null }, BUYER)).toBe(false)
  })

  it('needs both conditions: a foreign user_id alone is not a collected gift', () => {
    expect(giftWasCollected({ user_id: RECIPIENT, gift_claimed_at: null }, BUYER)).toBe(false)
  })

  it('the held rule and the collected rule are exclusive on the claimed row', () => {
    const claimed = {
      user_id: RECIPIENT,
      gift_claimed_at: '2026-10-05T08:00:00Z',
      gift_claim_token_hash: 'abc',
    }
    expect(isGiftedAway(claimed)).toBe(false)
    expect(giftWasCollected(claimed, BUYER)).toBe(true)
  })
})
