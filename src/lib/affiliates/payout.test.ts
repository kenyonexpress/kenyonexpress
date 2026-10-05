import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { payoutRequestStatus, requestCovers, requestablePayoutAgorot } from './payout'

const a = (n: number) => agorot(n)

describe('requestablePayoutAgorot', () => {
  it('is the paid commissions when nothing was asked before and the wallet still holds them', () => {
    expect(
      requestablePayoutAgorot({
        paidCommissionAgorot: a(12_345),
        coveredByRequestsAgorot: [],
        walletBalanceAgorot: a(12_345),
      }),
    ).toBe(12_345)
  })

  it('subtracts every earlier request that still covers part of the sum', () => {
    expect(
      requestablePayoutAgorot({
        paidCommissionAgorot: a(10_000),
        coveredByRequestsAgorot: [a(3_000), a(2_500)],
        walletBalanceAgorot: a(10_000),
      }),
    ).toBe(4_500)
  })

  it('is capped by the wallet balance when credit was spent in the shop', () => {
    expect(
      requestablePayoutAgorot({
        paidCommissionAgorot: a(10_000),
        coveredByRequestsAgorot: [],
        walletBalanceAgorot: a(1_999),
      }),
    ).toBe(1_999)
  })

  it('never goes below zero, whichever ceiling is exceeded', () => {
    expect(
      requestablePayoutAgorot({
        paidCommissionAgorot: a(1_000),
        coveredByRequestsAgorot: [a(1_000)],
        walletBalanceAgorot: a(5_000),
      }),
    ).toBe(0)
    expect(
      requestablePayoutAgorot({
        paidCommissionAgorot: a(1_000),
        coveredByRequestsAgorot: [a(1_500)],
        walletBalanceAgorot: a(5_000),
      }),
    ).toBe(0)
    expect(
      requestablePayoutAgorot({
        paidCommissionAgorot: a(1_000),
        coveredByRequestsAgorot: [],
        walletBalanceAgorot: a(0),
      }),
    ).toBe(0)
  })

  it('is integer agorot in and out', () => {
    const out = requestablePayoutAgorot({
      paidCommissionAgorot: a(7),
      coveredByRequestsAgorot: [a(1), a(2)],
      walletBalanceAgorot: a(100),
    })
    expect(out).toBe(4)
    expect(Number.isInteger(out)).toBe(true)
  })
})

describe('request statuses', () => {
  it('reads an unknown status as pending, the state that blocks a second request', () => {
    expect(payoutRequestStatus('paid')).toBe('paid')
    expect(payoutRequestStatus('rejected')).toBe('rejected')
    expect(payoutRequestStatus('surprise')).toBe('pending')
    expect(payoutRequestStatus(null)).toBe('pending')
  })

  it('counts pending and paid against the sum, and a rejected one not at all', () => {
    expect(requestCovers('pending')).toBe(true)
    expect(requestCovers('paid')).toBe(true)
    expect(requestCovers('rejected')).toBe(false)
  })
})
