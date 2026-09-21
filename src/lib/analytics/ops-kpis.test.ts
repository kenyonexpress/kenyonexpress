import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { EMPTY_REFUNDS, EMPTY_VOUCHERS, computeOpsKpis, formatBp, shareBp } from './ops-kpis'

describe('shareBp', () => {
  it('is integer basis points, rounded half up', () => {
    expect(shareBp(1, 3)).toBe(3333)
    expect(shareBp(2, 3)).toBe(6667)
    expect(shareBp(1, 8)).toBe(1250)
    expect(shareBp(5, 5)).toBe(10_000)
  })

  it('is null with nothing to divide by, and zero with nothing on top', () => {
    expect(shareBp(0, 0)).toBeNull()
    expect(shareBp(3, 0)).toBeNull()
    expect(shareBp(0, 9)).toBe(0)
    expect(shareBp(-1, 9)).toBe(0)
    expect(shareBp(Number.NaN, 9)).toBeNull()
  })
})

describe('formatBp', () => {
  it('renders a dash for null and one decimal otherwise', () => {
    expect(formatBp(null)).toBe('—')
    expect(formatBp(3333)).toBe('33.3%')
    expect(formatBp(0)).toBe('0.0%')
    expect(formatBp(10_000)).toBe('100.0%')
  })
})

describe('computeOpsKpis', () => {
  it('measures redemption against the redeemable vouchers, not every issued one', () => {
    // Twelve issued, one redeemed, one refunded: production on 22.09.2026.
    // The refunded one can never be scanned, so the rate is 1/13 of the
    // fourteen minus the one voided, not 1/14.
    const kpis = computeOpsKpis({
      vouchers: { issued: 14, redeemed: 1, voided: 1 },
      refunds: EMPTY_REFUNDS,
      paidOrders: 20,
      gmvAgorot: agorot(100_000),
    })
    expect(kpis.redemptionRateBp).toBe(shareBp(1, 13))
    expect(kpis.refundRateBp).toBe(0)
    expect(kpis.refundShareOfGmvBp).toBe(0)
  })

  it('refund rate counts completed refunds over paid orders, and share over GMV', () => {
    const kpis = computeOpsKpis({
      vouchers: EMPTY_VOUCHERS,
      refunds: { requested: 3, completed: 2, grantedAgorot: agorot(2_500) },
      paidOrders: 8,
      gmvAgorot: agorot(50_000),
    })
    expect(kpis.redemptionRateBp).toBeNull()
    expect(kpis.refundRateBp).toBe(2500)
    expect(kpis.refundShareOfGmvBp).toBe(500)
  })

  it('does not go negative when more vouchers were voided than issued in the window', () => {
    const kpis = computeOpsKpis({
      vouchers: { issued: 1, redeemed: 0, voided: 3 },
      refunds: EMPTY_REFUNDS,
      paidOrders: 0,
      gmvAgorot: agorot(0),
    })
    expect(kpis.redemptionRateBp).toBeNull()
    expect(kpis.refundRateBp).toBeNull()
  })
})
