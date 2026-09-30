import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The bell's server-side first paint. What can only fail here: a signed-out
 * caller gets null (the component renders nothing), an absent table (198
 * unapplied) is an empty bell and not an error, and the badge is the count
 * of every unread row rather than the unread rows inside the panel.
 */

const getUser = vi.fn()
const order = vi.fn()
const limit = vi.fn()
const isNull = vi.fn()
const select = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
    from: () => ({
      select: (cols: string, opts?: { head?: boolean }) => {
        select(cols, opts)
        if (opts?.head) return { is: (...a: unknown[]) => isNull(...a) }
        return {
          order: (...a: unknown[]) => {
            order(...a)
            return { limit: (n: number) => limit(n) }
          },
        }
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
  limit.mockResolvedValue({ data: [{ id: 'n-1', read_at: null }], error: null })
  isNull.mockResolvedValue({ count: 7 })
})

describe('loadBell', () => {
  it('is null when signed out, so the bell renders nothing', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await loadBell()).toBeNull()
    expect(select).not.toHaveBeenCalled()
  })

  it('returns the newest rows and the all-unread count', async () => {
    expect(await loadBell()).toEqual({ rows: [{ id: 'n-1', read_at: null }], unread: 7 })
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(BELL_PANEL_SIZE)
    expect(isNull).toHaveBeenCalledWith('read_at', null)
  })

  it('treats a missing table as an empty bell without logging', async () => {
    limit.mockResolvedValue({ data: null, error: { code: '42P01', message: 'no table' } })
    expect(await loadBell()).toEqual({ rows: [], unread: 0 })
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('logs any other read failure and still answers an empty bell', async () => {
    limit.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    expect(await loadBell()).toEqual({ rows: [], unread: 0 })
    expect(logWarn).toHaveBeenCalledWith('notifications.bell_read_failed', { reason: 'denied' })
  })
})
