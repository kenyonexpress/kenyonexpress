import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The server half of the retention cohorts: read `orders.paid_at` for the
 * user, bucket through the pure module, write one `$set` keyed on the id
 * the funnel events used. Best effort throughout: no key, no rows, a refused
 * query, all mean no event and never a throw into the caller (track.ts rule 2).
 */
const trackEvent = vi.fn()
const isPostHogEnabled = vi.fn(() => true)
vi.mock('@/lib/observability/posthog', () => ({
  isPostHogEnabled: () => isPostHogEnabled(),
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}))

let rows: { paid_at: string | null }[] | null = []
let queryError: unknown = null
const calls: { table?: string; filters: unknown[][] } = { filters: [] }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      calls.table = table
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => {
          calls.filters.push(['eq', ...args])
          return chain
        },
        not: (...args: unknown[]) => {
          calls.filters.push(['not', ...args])
          return Promise.resolve({ data: rows, error: queryError })
        },
      }
      return chain
    },
  }),
}))

import { paidAtForUser, syncRetentionPersonProperties } from './retention-cohorts'

beforeEach(() => {
  trackEvent.mockReset()
  isPostHogEnabled.mockReset().mockReturnValue(true)
  rows = []
  queryError = null
  calls.filters = []
  calls.table = undefined
})

describe('paidAtForUser', () => {
  it('reads paid orders of that user only', async () => {
    rows = [{ paid_at: '2026-01-05T08:30:00.000Z' }, { paid_at: null }]
    expect(await paidAtForUser('user-1')).toEqual(['2026-01-05T08:30:00.000Z'])
    expect(calls.table).toBe('orders')
    expect(calls.filters).toEqual([
      ['eq', 'user_id', 'user-1'],
      ['not', 'paid_at', 'is', null],
    ])
  })

  it('is null on a refused query', async () => {
    queryError = { message: 'permission denied' }
    expect(await paidAtForUser('user-1')).toBeNull()
  })
})

describe('syncRetentionPersonProperties', () => {
  it('writes the four properties as $set under the funnel id', async () => {
    rows = [{ paid_at: '2026-02-20T18:00:00.000Z' }, { paid_at: '2026-01-05T08:30:00.000Z' }]
    await syncRetentionPersonProperties('user-1', 'browser-id')
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith(
      '$set',
      {},
      {
        distinctId: 'browser-id',
        set: {
          purchase_count: 2,
          first_purchase_at: '2026-01-05T08:30:00.000Z',
          last_purchase_at: '2026-02-20T18:00:00.000Z',
          acquisition_month: '2026-01',
        },
      },
    )
  })

  it('writes nothing without a key, without paid orders, or on a failed read', async () => {
    isPostHogEnabled.mockReturnValue(false)
    rows = [{ paid_at: '2026-01-05T08:30:00.000Z' }]
    await syncRetentionPersonProperties('user-1', 'browser-id')
    expect(trackEvent).not.toHaveBeenCalled()

    isPostHogEnabled.mockReturnValue(true)
    rows = []
    await syncRetentionPersonProperties('user-1', 'browser-id')
    expect(trackEvent).not.toHaveBeenCalled()

    queryError = { message: 'nope' }
    await expect(syncRetentionPersonProperties('user-1', 'browser-id')).resolves.toBeUndefined()
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
