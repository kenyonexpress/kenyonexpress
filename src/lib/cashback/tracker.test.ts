import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { EVERY_FIFTH_PURCHASE_CASHBACK_BP, FIRST_PURCHASE_CASHBACK_BP } from './engine'
import {
  CASHBACK_ENTRY_LABELS,
  type LedgerRowLike,
  cashbackEntryLabel,
  cashbackOverview,
  liveCashbackCredits,
  nextBonus,
} from './tracker'

const NOW = new Date('2026-09-17T12:00:00Z')

function credit(amount: number, createdAt: string, reason = 'order_cashback'): LedgerRowLike {
  return { direction: 'credit', amountAgorot: agorot(amount), reason, createdAt }
}
function debit(amount: number, createdAt: string, reason = 'order_spend'): LedgerRowLike {
  return { direction: 'debit', amountAgorot: agorot(amount), reason, createdAt }
}

describe('nextBonus', () => {
  it('names the first purchase at 10% for a customer with no paid orders', () => {
    expect(nextBonus(0)).toEqual({
      purchaseNumber: 1,
      purchasesAway: 1,
      rateBp: FIRST_PURCHASE_CASHBACK_BP,
      progressPercent: 0,
    })
  })

  it('walks to the fifth purchase after the first, one order at a time', () => {
    expect(nextBonus(1)).toMatchObject({ purchaseNumber: 5, purchasesAway: 4, progressPercent: 20 })
    expect(nextBonus(2)).toMatchObject({ purchaseNumber: 5, purchasesAway: 3, progressPercent: 40 })
    expect(nextBonus(4)).toMatchObject({
      purchaseNumber: 5,
      purchasesAway: 1,
      progressPercent: 80,
      rateBp: EVERY_FIFTH_PURCHASE_CASHBACK_BP,
    })
  })

  it('rolls to the next multiple of five once a bonus purchase is paid', () => {
    // The fifth order was paid; the tenth is next, and the window restarts.
    expect(nextBonus(5)).toMatchObject({ purchaseNumber: 10, purchasesAway: 5, progressPercent: 0 })
    expect(nextBonus(9)).toMatchObject({
      purchaseNumber: 10,
      purchasesAway: 1,
      progressPercent: 80,
    })
    expect(nextBonus(10)).toMatchObject({ purchaseNumber: 15, purchasesAway: 5 })
  })

  it('rejects a count that is not a non-negative integer', () => {
    expect(() => nextBonus(-1)).toThrow(RangeError)
    expect(() => nextBonus(1.5)).toThrow(RangeError)
    expect(() => nextBonus(Number.NaN)).toThrow(RangeError)
  })
})

describe('liveCashbackCredits', () => {
  it('consumes the oldest credit first, the way the sweep does', () => {
    const rows = [
      credit(1000, '2026-01-01T00:00:00Z'),
      credit(2000, '2026-03-01T00:00:00Z', 'cashback_bonus'),
      debit(1500, '2026-04-01T00:00:00Z'),
    ]
    const live = liveCashbackCredits(rows, NOW)
    // The January credit is gone; 500 of the March one survives the debit.
    expect(live).toHaveLength(1)
    expect(live[0]?.remainingAgorot).toBe(1500)
    expect(live[0]?.expiresAt.toISOString()).toBe('2027-03-01T00:00:00.000Z')
  })

  it('ignores credits that are not cashback and debits of every kind count', () => {
    const rows = [
      credit(5000, '2026-02-01T00:00:00Z', 'admin_credit'),
      credit(1000, '2026-02-02T00:00:00Z'),
      debit(300, '2026-02-03T00:00:00Z', 'cashback_expiry'),
      debit(200, '2026-02-04T00:00:00Z', 'order_refund'),
    ]
    const live = liveCashbackCredits(rows, NOW)
    expect(live).toHaveLength(1)
    expect(live[0]?.remainingAgorot).toBe(500)
  })

  it('drops a credit already past its twelfth month', () => {
    const rows = [credit(1000, '2025-09-01T00:00:00Z'), credit(1000, '2025-10-01T00:00:00Z')]
    const live = liveCashbackCredits(rows, NOW)
    expect(live.map((c) => c.earnedAt.toISOString())).toEqual(['2025-10-01T00:00:00.000Z'])
  })

  it('orders by earned date regardless of row order', () => {
    const rows = [credit(100, '2026-05-01T00:00:00Z'), credit(100, '2026-04-01T00:00:00Z')]
    const live = liveCashbackCredits(rows, NOW)
    expect(live.map((c) => c.earnedAt.toISOString())).toEqual([
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    ])
  })
})

describe('cashbackOverview', () => {
  it('sums lifetime credits, live credits and what lapses within thirty days', () => {
    const rows = [
      credit(1000, '2025-09-01T00:00:00Z'), // lapsed already
      credit(2000, '2025-10-01T00:00:00Z'), // lapses 2026-10-01, inside 30 days
      credit(3000, '2026-06-01T00:00:00Z', 'cashback_bonus'),
      debit(500, '2026-07-01T00:00:00Z'),
      credit(700, '2026-08-01T00:00:00Z', 'order_refund'), // not cashback
    ]
    const overview = cashbackOverview(rows, NOW)
    expect(overview.lifetimeEarnedAgorot).toBe(6000)
    // The 500 debit ate the lapsed January credit, so both later credits are whole.
    expect(overview.liveAgorot).toBe(5000)
    expect(overview.expiringSoonAgorot).toBe(2000)
    expect(overview.nextToExpire?.expiresAt.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('is empty, not broken, for an account with no ledger', () => {
    const overview = cashbackOverview([], NOW)
    expect(overview).toEqual({
      lifetimeEarnedAgorot: 0,
      liveAgorot: 0,
      nextToExpire: null,
      expiringSoonAgorot: 0,
    })
  })
})

describe('cashbackEntryLabel', () => {
  it('covers every entry_type the 215 constraint allows, in Hebrew', () => {
    for (const type of [
      'order_item',
      'first_purchase_bonus',
      'fifth_purchase_bonus',
      'admin_adjustment',
      'expiry',
    ]) {
      expect(CASHBACK_ENTRY_LABELS[type]).toMatch(/[֐-׿]/)
    }
    expect(cashbackEntryLabel('something_new')).toBe('something_new')
  })
})
