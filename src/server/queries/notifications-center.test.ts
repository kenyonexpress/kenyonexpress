import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The center's one-window read. What can only fail here: the preference
 * rows narrow the query (a muted shelf is a `not in` on the wire, not a
 * TypeScript filter after the fact, so the badge count built on the same
 * predicate agrees); the selected tab is cut from the window; the counters
 * are per shelf with unread separate; and an absent table (198 unapplied) is
 * an empty center and not a 500.
 */

const prefsSelect = vi.fn()
const rowsLimit = vi.fn()
const notIn = vi.fn()
const inList = vi.fn()
const logWarn = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'notification_preferences') return prefsSelect()
        const chain = {
          in: (...a: unknown[]) => {
            inList(...a)
            return chain
          },
          not: (...a: unknown[]) => {
            notIn(...a)
            return chain
          },
          order: () => ({ limit: (n: number) => rowsLimit(n) }),
        }
        return chain
      },
    }),
  }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { CENTER_COUNT_WINDOW, loadNotificationCenter } from './notifications'

function row(id: string, kind: string, read_at: string | null = null) {
  return {
    id,
    kind,
    title_he: `t-${id}`,
    body_he: null,
    href: '/account',
    read_at,
    created_at: '2026-10-08T00:00:00Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prefsSelect.mockResolvedValue({ data: [], error: null })
  rowsLimit.mockResolvedValue({
    data: [
      row('1', 'order_paid'),
      row('2', 'order_shipped', '2026-10-01T00:00:00Z'),
      row('3', 'price_drop'),
      row('4', 'welcome'),
      row('5', 'something_new'),
    ],
    error: null,
  })
})

describe('loadNotificationCenter', () => {
  it('reads one window, counts every shelf, and lists everything on the all tab', async () => {
    const center = await loadNotificationCenter(null)
    expect(rowsLimit).toHaveBeenCalledWith(CENTER_COUNT_WINDOW)
    expect(center.rows.map((r) => r.id)).toEqual(['1', '2', '3', '4', '5'])
    expect(center.counts).toEqual({
      orders: { total: 2, unread: 1 },
      deals: { total: 1, unread: 1 },
      account: { total: 1, unread: 1 },
      system: { total: 1, unread: 1 },
    })
    expect(center.unread).toBe(4)
    expect(center.muted).toEqual([])
    expect(notIn).not.toHaveBeenCalled()
    expect(inList).not.toHaveBeenCalled()
  })

  it('cuts the selected tab from the same window, the fallback shelf included', async () => {
    expect((await loadNotificationCenter('orders')).rows.map((r) => r.id)).toEqual(['1', '2'])
    expect((await loadNotificationCenter('system')).rows.map((r) => r.id)).toEqual(['5'])
    expect((await loadNotificationCenter('deals')).rows.map((r) => r.id)).toEqual(['3'])
  })

  it('puts a muted shelf on the wire as a not-in, and reports it as muted', async () => {
    prefsSelect.mockResolvedValue({
      data: [{ kind: 'category:deals', channel: 'in_app', enabled: false }],
      error: null,
    })
    const center = await loadNotificationCenter(null)
    expect(notIn).toHaveBeenCalledWith('kind', 'in', expect.stringContaining('price_drop'))
    expect(center.muted).toEqual(['deals'])
    expect(center.exclusion.hide).toContain('price_drop')
  })

  it('is an empty center, not an error, when the table is absent', async () => {
    rowsLimit.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: 'cache' } })
    const center = await loadNotificationCenter('orders')
    expect(center.rows).toEqual([])
    expect(center.unread).toBe(0)
    expect(center.counts.orders).toEqual({ total: 0, unread: 0 })
  })

  it('logs any other failure and still answers', async () => {
    rowsLimit.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    expect((await loadNotificationCenter(null)).rows).toEqual([])
    expect(logWarn).toHaveBeenCalledWith('notifications.center_read_failed', { reason: 'denied' })
  })
})
