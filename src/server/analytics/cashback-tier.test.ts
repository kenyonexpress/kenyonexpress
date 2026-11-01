import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The cohort label's data path: decimal ILS rows from `v_wallet_ledger` in,
 * one tier out, and null (never a throw, never a guess) on every failure.
 * The write path is pinned too: the tier travels as `$set` on a dedicated
 * event, so a slow wallet query can never sit between a money event and
 * PostHog receiving it.
 */

const trackEvent = vi.fn()
const isPostHogEnabled = vi.fn(() => true)
vi.mock('@/lib/observability/posthog', () => ({
  isPostHogEnabled: () => isPostHogEnabled(),
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}))

let queryResult: { data: unknown; error: unknown } = { data: [], error: null }
const filters = vi.fn()

// The PostgREST builder shape the module walks: select().eq().eq().eq(), then
// awaited. Filters are recorded so the test can assert WHICH rows were asked
// for; asking for debits or for another reason would sum the wrong money.
function builder(): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (column: string, value: unknown) => {
    filters({ column, value })
    return chain
  }
  // biome-ignore lint/suspicious/noThenProperty: a thenable is exactly what PostgREST's builder is; awaiting it is the behaviour under test.
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(queryResult).then(resolve)
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

import { cashbackTierForUser, syncCashbackTierPersonProperty } from './cashback-tier'

beforeEach(() => {
  trackEvent.mockReset()
  filters.mockReset()
  isPostHogEnabled.mockReturnValue(true)
  queryResult = { data: [], error: null }
})

describe('cashbackTierForUser', () => {
  it('sums decimal ILS rows into agorot and buckets them', async () => {
    // 60.50 + 445.25 = 505.75 shekels = 50,575 agorot, past the gold line.
    queryResult = { data: [{ amount_ils: '60.50' }, { amount_ils: 445.25 }], error: null }
    await expect(cashbackTierForUser('user-1')).resolves.toBe('gold')
  })

  it("asks only for this user's cashback credits", async () => {
    await cashbackTierForUser('user-1')
    expect(filters.mock.calls.map((call) => call[0])).toEqual([
      { column: 'user_id', value: 'user-1' },
      { column: 'direction', value: 'credit' },
      { column: 'reason', value: 'order_cashback' },
    ])
  })

  it('labels a user with no cashback none, not null', async () => {
    // No rows is an answer: the person genuinely earned nothing.
    await expect(cashbackTierForUser('user-1')).resolves.toBe('none')
  })

  it('returns null when the query is refused', async () => {
    queryResult = { data: null, error: { message: 'permission denied' } }
    await expect(cashbackTierForUser('user-1')).resolves.toBeNull()
  })
})

describe('syncCashbackTierPersonProperty', () => {
  it('writes the tier as $set under the funnel identity', async () => {
    queryResult = { data: [{ amount_ils: '150.00' }], error: null }
    await syncCashbackTierPersonProperty('user-1', 'ph-abc')
    expect(trackEvent).toHaveBeenCalledWith(
      '$set',
      {},
      { distinctId: 'ph-abc', set: { cashback_tier: 'silver' } },
    )
  })

  it('writes nothing when the tier could not be read', async () => {
    queryResult = { data: null, error: { message: 'nope' } }
    await syncCashbackTierPersonProperty('user-1', 'ph-abc')
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('does not even query without a PostHog key', async () => {
    isPostHogEnabled.mockReturnValue(false)
    await syncCashbackTierPersonProperty('user-1', 'ph-abc')
    expect(filters).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
