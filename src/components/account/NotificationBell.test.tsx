import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE BELL'S CLIENT CONTRACT, WITH THE NETWORK MOCKED OUT.
 *
 * The delivery path itself (publication membership, RLS-filtered events, the
 * read_at column grant) is proven against production by
 * scripts/verify-bell-realtime.mjs and cannot be proven here -- this suite has
 * no database and no websocket. What CAN regress silently in this file is the
 * wiring around those events, so that is what is pinned:
 *
 *   - a signed-out render is NOTHING, not a dead bell;
 *   - the badge counts unread and the panel renders the trigger's Hebrew
 *     as given (the component owns no copy);
 *   - the INSERT handler the channel was registered with actually moves the
 *     UI -- the exact spot where a bell "reports SUBSCRIBED and shows
 *     nothing" if the handler is miswired;
 *   - opening the panel writes read_at and nothing else, and clears the
 *     badge optimistically.
 */

type Handler = (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void

const mock = vi.hoisted(() => {
  const state = {
    user: { id: 'user-1' } as { id: string } | null,
    rows: [] as Record<string, unknown>[],
    unreadCount: 0,
    updates: [] as Record<string, unknown>[],
    updateFilters: [] as unknown[][],
    handlers: {} as Record<string, Handler>,
    channelNames: [] as string[],
    subscribed: 0,
  }
  return state
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = {
      on: (_type: string, cfg: { event: string; filter?: string }, cb: Handler) => {
        mock.handlers[cfg.event] = cb
        return channel
      },
      subscribe: () => {
        mock.subscribed += 1
        return channel
      },
    }
    return {
      auth: { getUser: async () => ({ data: { user: mock.user } }) },
      from: () => ({
        select: (_cols: string, opts?: { head?: boolean }) => {
          if (opts?.head) {
            return { is: async () => ({ count: mock.unreadCount }) }
          }
          return { order: () => ({ limit: async () => ({ data: mock.rows }) }) }
        },
        update: (patch: Record<string, unknown>) => ({
          is: async (...filter: unknown[]) => {
            mock.updates.push(patch)
            mock.updateFilters.push(filter)
            return { error: null }
          },
        }),
      }),
      channel: (name: string) => {
        mock.channelNames.push(name)
        return channel
      },
      removeChannel: async () => 'ok' as const,
    }
  },
}))

import NotificationBell from './NotificationBell'

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n-1',
    kind: 'cashback_credited',
    title_he: 'נוסף קאשבק לארנק',
    body_he: '₪42 נוספו לארנק שלך',
    href: '/account/wallet',
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  mock.user = { id: 'user-1' }
  mock.rows = []
  mock.unreadCount = 0
  mock.updates = []
  mock.updateFilters = []
  mock.handlers = {}
  mock.channelNames = []
  mock.subscribed = 0
})

describe('NotificationBell', () => {
  it('renders nothing when there is no session', async () => {
    mock.user = null
    const { container } = render(<NotificationBell />)
    await flush()
    expect(container.firstChild).toBeNull()
    expect(mock.subscribed).toBe(0)
  })

  it('shows the unread badge and the Hebrew the trigger wrote', async () => {
    mock.rows = [
      row(),
      row({
        id: 'n-2',
        title_he: 'ההזמנה שלך נשלחה',
        body_he: null,
        read_at: '2026-09-01T00:00:00Z',
      }),
    ]
    mock.unreadCount = 1
    render(<NotificationBell />)
    await flush()

    const button = screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' })
    expect(button).toHaveTextContent('1')
    expect(mock.channelNames).toEqual(['bell:user-1'])
    expect(mock.subscribed).toBe(1)

    fireEvent.click(button)
    expect(screen.getByText('נוסף קאשבק לארנק')).toBeInTheDocument()
    expect(screen.getByText('₪42 נוספו לארנק שלך')).toBeInTheDocument()
    expect(screen.getByText('ההזמנה שלך נשלחה')).toBeInTheDocument()
  })

  it('rings on a realtime INSERT: the registered handler moves the badge', async () => {
    render(<NotificationBell />)
    await flush()
    expect(screen.getByRole('button', { name: 'התראות' })).toBeInTheDocument()

    act(() => {
      mock.handlers.INSERT?.({ new: row({ id: 'n-live', title_he: 'הקופון שלך מוכן' }), old: {} })
    })
    expect(screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' }))
    expect(screen.getByText('הקופון שלך מוכן')).toBeInTheDocument()
  })

  it('marks read on open: read_at only, badge cleared, echo UPDATE is inert', async () => {
    mock.rows = [row()]
    mock.unreadCount = 1
    render(<NotificationBell />)
    await flush()

    fireEvent.click(screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' }))
    await flush()

    expect(mock.updates).toHaveLength(1)
    expect(Object.keys(mock.updates[0] ?? {})).toEqual(['read_at'])
    expect(screen.getByRole('button', { name: 'התראות' })).toBeInTheDocument()

    // The UPDATE event for our own write comes back with old.read_at already
    // null -> set; the badge is at 0 and must stay there.
    act(() => {
      mock.handlers.UPDATE?.({
        new: row({ read_at: '2026-09-10T00:00:00Z' }),
        old: row({ read_at: null }),
      })
    })
    expect(screen.getByRole('button', { name: 'התראות' })).toBeInTheDocument()
  })

  it('decrements the badge when another tab marks a row read', async () => {
    mock.rows = [row()]
    mock.unreadCount = 2
    render(<NotificationBell />)
    await flush()
    expect(screen.getByRole('button', { name: 'התראות, 2 שלא נקראו' })).toBeInTheDocument()

    act(() => {
      mock.handlers.UPDATE?.({
        new: row({ read_at: '2026-09-10T00:00:00Z' }),
        old: row({ read_at: null }),
      })
    })
    expect(screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' })).toBeInTheDocument()
  })
})
