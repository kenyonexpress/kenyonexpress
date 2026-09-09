import { describe, expect, it } from 'vitest'
import { expiryCreditKey, expiryRefundView } from './expiry-refund'

/**
 * The three states an expired coupon's money can be in, and the one that used
 * to be missing from every surface.
 */

const base = { status: 'expired', coupon_price_agorot: 10_800, credit: null }

describe('expiryRefundView', () => {
  it('says the money is coming while the credit job has not reached it', () => {
    const view = expiryRefundView(base)
    expect(view.state).toBe('pending')
    expect(view.amountAgorot).toBe(10_800)
    expect(view.headline).toContain('108')
  })

  it('names the amount that actually landed once the ledger has spoken', () => {
    const view = expiryRefundView({
      ...base,
      credit: { amountAgorot: 10_800, createdAt: '2026-09-10T02:20:00Z' },
    })
    expect(view.state).toBe('credited')
    expect(view.amountAgorot).toBe(10_800)
  })

  /**
   * The ledger is the authority, not the voucher. They should agree; when they
   * do not, the customer must be shown what reached them and not what the page
   * would have preferred to print.
   */
  it('prefers the ledger amount over the voucher when they disagree', () => {
    const view = expiryRefundView({
      ...base,
      coupon_price_agorot: 10_800,
      credit: { amountAgorot: 9_000, createdAt: '2026-09-10T02:20:00Z' },
    })
    expect(view.amountAgorot).toBe(9_000)
    expect(view.headline).toContain('90')
  })

  /**
   * The states that already have their own sentence elsewhere. A wallet-refund
   * line on any of these describes a second sum of money that does not exist.
   */
  it.each(['issued', 'redeemed', 'cancelled', 'refunded'])('says nothing for %s', (status) => {
    expect(expiryRefundView({ ...base, status }).state).toBe('none')
  })

  it('says nothing when nothing was paid online', () => {
    expect(expiryRefundView({ ...base, coupon_price_agorot: 0 }).state).toBe('none')
  })

  /** A ₪0 refund line reads as though something nearly happened. */
  it('says nothing for a negative or unreadable price', () => {
    expect(expiryRefundView({ ...base, coupon_price_agorot: -5 }).state).toBe('none')
    expect(expiryRefundView({ ...base, coupon_price_agorot: Number.NaN }).state).toBe('none')
  })

  /** Both the DB function and the reader must spell the key identically. */
  it('spells the idempotency key the way credit_expired_vouchers() writes it', () => {
    expect(expiryCreditKey('abc')).toBe('voucher:abc:expiry_credit')
  })
})
