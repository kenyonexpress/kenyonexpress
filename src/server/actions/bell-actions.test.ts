import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The bell's server-side first paint. What can only fail here: a signed-out
 * caller gets null (the component renders nothing), an absent table (198
 * unapplied) is an empty bell and not an error, the badge is the count of
 * every unread row rather than the unread rows inside the panel, and a muted
 * shelf (STEP 49) narrows BOTH the rows and the count on the wire and is
 * reported back so the realtime handler can apply the same cut.
 */

const getUser = vi.fn()
const order = vi.fn()
const limit = vi.fn()
const isNull = vi.fn()
const select = vi.fn()
const prefsSelect = vi.fn()
const notIn = vi.fn()
const inList = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
    from: (table: string) => ({
      select: (cols: string, opts?: { head?: boolean }) => {
        if (table === 'notification_preferences') return prefsSelect()
        select(cols, opts)
        const chain = {
          in: (...a: unknown[]) => {
            inList(...a)
            return chain
          },
          not: (...a: unknown[]) => {
            notIn(...a)
            return chain
          },
          is: (...a: unknown[]) => isNull(...a),
          order: (...a: unknown[]) => {
            order(...a)
            return { limit: (n: number) => limit(n) }
          },
        }
        return chain
      },
    }),
  }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

import { BELL_PANEL_SIZE } from '@/lib/notifications/bell'
import { loadBell } from './bell'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
  prefsSelect.mockResolvedValue({ data: [], error: null })
  limit.mockResolvedValue({ data: [{ id: 'n-1', read_at: null }], error: null })
  isNull.mockResolvedValue({ count: 7 })
})

describe('loadBell', () => {
  it('is null when signed out, so the bell renders nothing', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await loadBell()).toBeNull()
    expect(select).not.toHaveBeenCalled()
    expect(prefsSelect).not.toHaveBeenCalled()
  })

  it('returns the newest rows and the all-unread count', async () => {
    expect(await loadBell()).toEqual({
      rows: [{ id: 'n-1', read_at: null }],
      unread: 7,
      exclusion: { hide: [], only: null },
      muted: [],
    })
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(BELL_PANEL_SIZE)
    expect(isNull).toHaveBeenCalledWith('read_at', null)
    expect(notIn).not.toHaveBeenCalled()
  })

  it('narrows the rows AND the count by a muted shelf, and says which', async () => {
    prefsSelect.mockResolvedValue({
      data: [{ kind: 'category:account', channel: 'in_app', enabled: false }],
      error: null,
    })
    const snapshot = await loadBell()
    expect(snapshot?.muted).toEqual(['account'])
    expect(snapshot?.exclusion.hide).toEqual(
      expect.arrayContaining(['welcome', 'cashback_credited', 'loyalty_tier_upgraded']),
    )
    // Once for the rows, once for the HEAD count.
    expect(notIn).toHaveBeenCalledTimes(2)
    expect(notIn).toHaveBeenCalledWith('kind', 'in', expect.stringContaining('welcome'))
  })

  it('treats a failed preferences read as nothing muted', async () => {
    prefsSelect.mockResolvedValue({ data: null, error: { code: '42P01', message: 'no table' } })
    const snapshot = await loadBell()
    expect(snapshot?.muted).toEqual([])
    expect(snapshot?.unread).toBe(7)
  })

  it('treats a missing table as an empty bell without logging', async () => {
    limit.mockResolvedValue({ data: null, error: { code: '42P01', message: 'no table' } })
    expect(await loadBell()).toEqual({
      rows: [],
      unread: 0,
      exclusion: { hide: [], only: null },
      muted: [],
    })
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('logs any other read failure and still answers an empty bell', async () => {
    limit.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    expect((await loadBell())?.rows).toEqual([])
    expect(logWarn).toHaveBeenCalledWith('notifications.bell_read_failed', { reason: 'denied' })
  })
})
