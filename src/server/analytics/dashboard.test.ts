import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The loaders behind the admin analytics panels: a failed read must come back
 * as `{ ok: false }` with the database's reason, never as an empty list that
 * the page would render as a quiet day. Every table the loaders touch is
 * exercised in both directions, and the money mapping is checked against the
 * legacy numeric mirror.
 */

type Result = { data: unknown; error: unknown; count?: number | null }

const results = new Map<string, Result>()
const calls: { table: string; columns: unknown; options: unknown }[] = []

function settle(k: string): Result {
  return results.get(k) ?? { data: [], error: null, count: 0 }
}

function builder(k: string): never {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(k)).then(resolve, reject)
        }
        return () => proxy
      },
    },
  )
  return proxy as never
}

const admin = {
  from: (table: string) => ({
    select: (columns?: unknown, options?: unknown) => {
      calls.push({ table, columns, options })
      const head = Boolean((options as { head?: boolean } | undefined)?.head)
      return builder(head ? `${table}.count` : `${table}.rows`)
    },
  }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const FAILURE = { code: '57014', message: 'statement timeout' }

beforeEach(() => {
  results.clear()
  calls.length = 0
  logError.mockClear()
})

describe('loadCouponCodes', () => {
  it('maps the four columns and reports no truncation under the cap', async () => {
    results.set('coupon_codes.rows', {
      data: [
        {
          status: 'used',
          created_at: '2026-03-01T00:00:00Z',
          redeemed_at: '2026-03-02T00:00:00Z',
          expires_at: '2026-06-01T00:00:00Z',
        },
      ],
      error: null,
    })
    const { loadCouponCodes } = await import('./dashboard')
    const loaded = await loadCouponCodes(30)
    expect(loaded).toEqual({
      ok: true,
      truncated: false,
      value: [
        {
          status: 'used',
          createdAt: '2026-03-01T00:00:00Z',
          redeemedAt: '2026-03-02T00:00:00Z',
          expiresAt: '2026-06-01T00:00:00Z',
        },
      ],
    })
  })

  it('fails loudly with the database reason', async () => {
    results.set('coupon_codes.rows', { data: null, error: FAILURE })
    const { loadCouponCodes } = await import('./dashboard')
    const loaded = await loadCouponCodes(30)
    expect(loaded).toEqual({ ok: false, reason: 'statement timeout' })
    expect(logError).toHaveBeenCalledWith('analytics.coupon_codes_failed', {
      reason: 'statement timeout',
    })
  })
})

describe('loadCashbackWallets', () => {
  it('prefers the agorot column and converts the numeric mirror once when it is missing', async () => {
    results.set('wallet_balances.rows', {
      data: [
        {
          balance_ils: 12.5,
          balance_ils_agorot: 1250,
          lifetime_earned_ils: 20,
          lifetime_redeemed_ils: 7.5,
        },
        {
          balance_ils: 3.07,
          balance_ils_agorot: null,
          lifetime_earned_ils: 3.07,
          lifetime_redeemed_ils: 0,
        },
      ],
      error: null,
    })
    const { loadCashbackWallets } = await import('./dashboard')
    const loaded = await loadCashbackWallets()
    expect(loaded).toEqual({
      ok: true,
      truncated: false,
      value: [
        { balanceAgorot: 1250, lifetimeEarnedAgorot: 2000, lifetimeRedeemedAgorot: 750 },
        { balanceAgorot: 307, lifetimeEarnedAgorot: 307, lifetimeRedeemedAgorot: 0 },
      ],
    })
  })

  it('names a malformed money value instead of summing around it', async () => {
    results.set('wallet_balances.rows', {
      data: [
        {
          balance_ils: 1.234,
          balance_ils_agorot: null,
          lifetime_earned_ils: 0,
          lifetime_redeemed_ils: 0,
        },
      ],
      error: null,
    })
    const { loadCashbackWallets } = await import('./dashboard')
    const loaded = await loadCashbackWallets()
    expect(loaded.ok).toBe(false)
    expect(logError).toHaveBeenCalledWith(
      'analytics.cashback_wallets_malformed',
      expect.objectContaining({ reason: expect.stringMatching(/two fraction digits/) }),
    )
  })

  it('fails loudly on a read error', async () => {
    results.set('wallet_balances.rows', { data: null, error: FAILURE })
    const { loadCashbackWallets } = await import('./dashboard')
    expect(await loadCashbackWallets()).toEqual({ ok: false, reason: 'statement timeout' })
  })
})

describe('loadSignups', () => {
  it('returns the in-window stamps and the head count from before the window', async () => {
    results.set('profiles.rows', {
      data: [{ created_at: '2026-03-01T00:00:00Z' }, { created_at: null }],
      error: null,
    })
    results.set('profiles.count', { data: null, error: null, count: 412 })
    const { loadSignups } = await import('./dashboard')
    const loaded = await loadSignups(30)
    expect(loaded).toEqual({
      ok: true,
      truncated: false,
      value: { createdAts: ['2026-03-01T00:00:00Z'], priorCount: 412 },
    })
    expect(calls.filter((c) => c.table === 'profiles')).toHaveLength(2)
  })

  it('fails when the prior count did not come back, even if the rows did', async () => {
    results.set('profiles.rows', { data: [], error: null })
    results.set('profiles.count', { data: null, error: null, count: null })
    const { loadSignups } = await import('./dashboard')
    const loaded = await loadSignups(30)
    expect(loaded).toEqual({ ok: false, reason: 'no count' })
  })
})

describe('loadOrderStats', () => {
  it('fails loudly on a read error', async () => {
    results.set('orders.rows', { data: null, error: FAILURE })
    const { loadOrderStats } = await import('./dashboard')
    expect(await loadOrderStats(30)).toEqual({ ok: false, reason: 'statement timeout' })
  })

  it('maps status, paid_at and expires_at', async () => {
    results.set('orders.rows', {
      data: [{ status: 'pending', paid_at: null, expires_at: '2026-03-02T00:00:00Z' }],
      error: null,
    })
    const { loadOrderStats } = await import('./dashboard')
    expect(await loadOrderStats(30)).toEqual({
      ok: true,
      truncated: false,
      value: [{ status: 'pending', paidAt: null, expiresAt: '2026-03-02T00:00:00Z' }],
    })
  })
})

describe('loadFunnelEvents', () => {
  it('reads the checkout step out of props and the purchase count from orders', async () => {
    results.set('analytics_events.rows', {
      data: [
        { session_id: 's1', event_name: 'view_product', props: {} },
        { session_id: 's1', event_name: 'checkout_step', props: { step: 'payment_redirect' } },
        { session_id: 's2', event_name: 'checkout_step', props: { step: 7 } },
        { session_id: 's3', event_name: 'page_view', props: null },
      ],
      error: null,
    })
    results.set('orders.count', { data: null, error: null, count: 3 })
    const { loadFunnelEvents } = await import('./dashboard')
    const loaded = await loadFunnelEvents(30)
    expect(loaded).toEqual({
      ok: true,
      truncated: false,
      value: {
        events: [
          { sessionId: 's1', eventName: 'view_product', step: null },
          { sessionId: 's1', eventName: 'checkout_step', step: 'payment_redirect' },
          { sessionId: 's2', eventName: 'checkout_step', step: null },
          { sessionId: 's3', eventName: 'page_view', step: null },
        ],
        purchases: 3,
      },
    })
  })

  it('fails when the events table is missing, with the database reason', async () => {
    results.set('analytics_events.rows', {
      data: null,
      error: { code: '42P01', message: 'relation "analytics_events" does not exist' },
    })
    results.set('orders.count', { data: null, error: null, count: 3 })
    const { loadFunnelEvents } = await import('./dashboard')
    expect(await loadFunnelEvents(30)).toEqual({
      ok: false,
      reason: 'relation "analytics_events" does not exist',
    })
  })
})
