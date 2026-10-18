import { describe, expect, it } from 'vitest'
import { commissionAgorot, decideSettlement, isLinkCode, newLinkCode } from './rules'

const DAY = 86_400_000
const now = new Date('2026-10-18T12:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
const base = {
  orderStatus: 'paid',
  paidAt: ago(20),
  createdAt: ago(20),
  orderTotalAgorot: 20_000,
  orderUserId: 'buyer',
  affiliateUserId: 'aff',
  commissionBp: 500,
  now,
}

describe('commissionAgorot', () => {
  it('is integer basis points of what was paid', () => {
    expect(commissionAgorot(20_000, 500)).toBe(1_000)
    expect(commissionAgorot(999, 333)).toBe(33)
    expect(commissionAgorot(0, 500)).toBe(0)
  })
})

describe('decideSettlement', () => {
  it('pays after the hold, once the order is paid', () => {
    expect(decideSettlement(base)).toEqual({
      action: 'pay',
      baseAgorot: 20_000,
      commissionAgorot: 1_000,
    })
  })

  it('waits inside the cancellation hold', () => {
    expect(decideSettlement({ ...base, paidAt: ago(3) })).toEqual({ action: 'wait' })
  })

  it('never pays an affiliate on their own order', () => {
    expect(decideSettlement({ ...base, orderUserId: 'aff' })).toEqual({
      action: 'reverse',
      reason: 'self_referral',
    })
  })

  it('reverses cancelled, refunded and abandoned orders', () => {
    expect(decideSettlement({ ...base, orderStatus: 'refunded' }).action).toBe('reverse')
    expect(decideSettlement({ ...base, orderStatus: 'cancelled' }).action).toBe('reverse')
    expect(decideSettlement({ ...base, paidAt: null, createdAt: ago(8) }).action).toBe('reverse')
    expect(decideSettlement({ ...base, paidAt: null, createdAt: ago(1) }).action).toBe('wait')
  })
})

describe('isLinkCode', () => {
  it('accepts only the stored shape', () => {
    expect(isLinkCode('af23abcdefgh')).toBe(true)
    expect(isLinkCode('ABC12345')).toBe(false)
    expect(isLinkCode('abc12345')).toBe(false)
    expect(isLinkCode('a;drop')).toBe(false)
  })
})

describe('newLinkCode', () => {
  it('always produces a code isLinkCode accepts', () => {
    const code = newLinkCode((n) => new Uint8Array(n).map((_, i) => i * 37))
    expect(isLinkCode(code)).toBe(true)
  })
})
