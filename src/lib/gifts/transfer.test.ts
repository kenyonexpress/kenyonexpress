import { describe, expect, it } from 'vitest'
import { giftTransferSchema, isVoucherId, transferEligibility } from './transfer'

const now = new Date('2026-09-25T10:00:00Z')
const live = { status: 'issued', expires_at: '2026-12-01T00:00:00Z' }

describe('transferEligibility', () => {
  it('allows a live coupon with no link out', () => {
    expect(transferEligibility(live, now)).toEqual({ ok: true })
  })

  it('allows a coupon that arrived as a gift and was claimed: that is history, not a pending link', () => {
    expect(
      transferEligibility(
        { ...live, gift_claim_token_hash: 'abc', gift_claimed_at: '2026-09-01T00:00:00Z' },
        now,
      ),
    ).toEqual({ ok: true })
  })

  it('refuses while a link is out and unclaimed, so two people never hold a link to one coupon', () => {
    expect(
      transferEligibility({ ...live, gift_claim_token_hash: 'abc', gift_claimed_at: null }, now),
    ).toEqual({ ok: false, code: 'PENDING_GIFT' })
  })

  it('refuses anything that is not issued, before looking at the link', () => {
    for (const status of ['redeemed', 'expired', 'cancelled', 'refunded']) {
      expect(transferEligibility({ ...live, status }, now)).toEqual({
        ok: false,
        code: 'NOT_ISSUED',
      })
    }
  })

  it('refuses a coupon past its date even if the row still says issued', () => {
    expect(
      transferEligibility({ status: 'issued', expires_at: '2026-09-25T09:59:59Z' }, now),
    ).toEqual({ ok: false, code: 'EXPIRED' })
    expect(transferEligibility({ status: 'issued', expires_at: null }, now)).toEqual({ ok: true })
  })
})

describe('giftTransferSchema', () => {
  it('needs a well-formed email and caps the greeting where the mail stops reading', () => {
    expect(giftTransferSchema.safeParse({ recipientEmail: 'a@b.co' }).success).toBe(true)
    expect(giftTransferSchema.safeParse({ recipientEmail: 'not-an-email' }).success).toBe(false)
    expect(giftTransferSchema.safeParse({ recipientEmail: '' }).success).toBe(false)
    expect(
      giftTransferSchema.safeParse({ recipientEmail: 'a@b.co', message: 'x'.repeat(501) }).success,
    ).toBe(false)
    expect(
      giftTransferSchema.safeParse({ recipientEmail: 'a@b.co', recipientName: 'x'.repeat(81) })
        .success,
    ).toBe(false)
  })
})

describe('isVoucherId', () => {
  it('accepts a UUID and nothing that would be a Postgres 22P02', () => {
    expect(isVoucherId('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
    expect(isVoucherId('123e4567')).toBe(false)
    expect(isVoucherId("' or 1=1")).toBe(false)
  })
})
