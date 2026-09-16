import { describe, expect, it } from 'vitest'
import { latestPaidOrderByUser, planSettlement, rankPaidOrders } from './settlement'

/**
 * The rank trap is the whole reason this module exists, so it is the first
 * thing pinned: an order that is no longer the user's latest must never be
 * handed to the RPC, however clearly it earned a bonus, because the RPC
 * would rank it by TODAY's count and could award a bonus it never earned.
 */

const order = (id: string, userId: string, paidAt: string) => ({ id, userId, paidAt })

describe('rankPaidOrders', () => {
  it('ranks per user by paid_at, 1-based', () => {
    const ranks = rankPaidOrders([
      order('u1-3', 'u1', '2026-09-03T00:00:00Z'),
      order('u1-1', 'u1', '2026-09-01T00:00:00Z'),
      order('u2-1', 'u2', '2026-09-02T00:00:00Z'),
      order('u1-2', 'u1', '2026-09-02T00:00:00Z'),
    ])
    expect([...ranks]).toEqual([
      ['u1-1', 1],
      ['u1-2', 2],
      ['u1-3', 3],
      ['u2-1', 1],
    ])
  })

  it('breaks a same-instant tie by id so two runs agree', () => {
    const ranks = rankPaidOrders([
      order('b', 'u', '2026-09-01T00:00:00Z'),
      order('a', 'u', '2026-09-01T00:00:00Z'),
    ])
    expect(ranks.get('a')).toBe(1)
    expect(ranks.get('b')).toBe(2)
  })
})

describe('latestPaidOrderByUser', () => {
  it('names the newest paid order of each user', () => {
    const latest = latestPaidOrderByUser([
      order('old', 'u', '2026-09-01T00:00:00Z'),
      order('new', 'u', '2026-09-05T00:00:00Z'),
      order('mid', 'u', '2026-09-03T00:00:00Z'),
    ])
    expect(latest.get('u')).toBe('new')
  })
})

describe('planSettlement', () => {
  const history = [
    order('o1', 'u', '2026-09-01T00:00:00Z'), // rank 1: 10%
    order('o2', 'u', '2026-09-02T00:00:00Z'), // rank 2: nothing
    order('o3', 'u', '2026-09-03T00:00:00Z'), // rank 3: nothing
    order('o4', 'u', '2026-09-04T00:00:00Z'), // rank 4: nothing
    order('o5', 'u', '2026-09-05T00:00:00Z'), // rank 5: 5%, and the latest
  ]

  it('credits the item snapshot wherever the wallet entry is missing, whatever the rank', () => {
    const plan = planSettlement({
      history,
      window: history,
      itemCashbackByOrder: new Map([
        ['o1', 500],
        ['o2', 300],
        ['o3', 0],
      ]),
      itemCredited: new Set(['o1']),
      bonusRecorded: new Set(['o1', 'o2', 'o3', 'o4', 'o5']),
    })
    expect(plan.itemCredits).toEqual([{ orderId: 'o2', userId: 'u', amountAgorot: 300 }])
    expect(plan.bonusCalls).toEqual([])
    expect(plan.deferred).toEqual([])
  })

  it('hands only the LATEST order to the RPC, and defers an older one that earned a bonus', () => {
    const plan = planSettlement({
      history,
      window: history,
      itemCashbackByOrder: new Map(),
      itemCredited: new Set(),
      bonusRecorded: new Set(), // nothing recorded at all
    })
    // o5 is the latest: the RPC's count(others)+1 is 5, the true rank.
    expect(plan.bonusCalls).toEqual([{ orderId: 'o5', userId: 'u', rank: 5 }])
    // o1 earned 10% and is not the latest; replaying it now would rank it 5th.
    expect(plan.deferred).toEqual([{ orderId: 'o1', userId: 'u', rank: 1, rateBp: 1000 }])
  })

  it('does not defer an older order that earned nothing', () => {
    const plan = planSettlement({
      history,
      window: [history[1]!, history[2]!, history[3]!],
      itemCashbackByOrder: new Map(),
      itemCredited: new Set(),
      bonusRecorded: new Set(),
    })
    expect(plan.bonusCalls).toEqual([])
    expect(plan.deferred).toEqual([])
  })

  it('skips the bonus leg entirely once the ledger row exists', () => {
    const plan = planSettlement({
      history,
      window: [history[4]!],
      itemCashbackByOrder: new Map(),
      itemCredited: new Set(),
      bonusRecorded: new Set(['o5']),
    })
    expect(plan.bonusCalls).toEqual([])
    expect(plan.deferred).toEqual([])
  })

  it('ranks against the whole history, not the window', () => {
    // Only o5 is in the window, but its rank comes from the four before it.
    const plan = planSettlement({
      history,
      window: [history[4]!],
      itemCashbackByOrder: new Map(),
      itemCredited: new Set(),
      bonusRecorded: new Set(),
    })
    expect(plan.bonusCalls).toEqual([{ orderId: 'o5', userId: 'u', rank: 5 }])
  })
})
