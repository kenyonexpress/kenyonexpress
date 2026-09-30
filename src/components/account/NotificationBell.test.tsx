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
 *   - the first paint comes from the Server Action (the session cookie is
 *     HttpOnly since STEP 18, so the browser client reads nothing itself);
 *   - the socket is authenticated with the ACCESS token the server handed
 *     over, before the channel is opened -- without `setAuth` the channel
 *     joins as `anon` and the RLS filter delivers nothing;
 *   - the badge counts unread and the panel renders the trigger's Hebrew
 *     as given (the component owns no copy);
 *   - the INSERT handler the channel was registered with actually moves the
 *     UI -- the exact spot where a bell "reports SUBSCRIBED and shows
 *     nothing" if the handler is miswired;
 *   - opening the panel marks everything read through the action and
 *     clears the badge optimistically.
 */

type Handler = (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void

const mock = vi.hoisted(() => {
  const state = {
    creds: { userId: 'user-1', accessToken: 'jwt-1' } as {
      userId: string
      accessToken: string
    } | null,
    rows: [] as Record<string, unknown>[],
    unreadCount: 0,
    markReadCalls: [] as (string | null)[],
    setAuthCalls: [] as string[],
    handlers: {} as Record<string, Handler>,
    channelNames: [] as string[],
    subscribed: 0,
    loadCalls: 0,
  }
  return state
})

vi.mock('@/server/actions/session', () => ({
  realtimeCredentials: async () => mock.creds,
}))
vi.mock('@/server/actions/bell', () => ({
  loadBell: async () => {
    mock.loadCalls += 1
    return { rows: mock.rows, unread: mock.unreadCount }
  },
}))
vi.mock('@/server/actions/notifications', () => ({
  markNotificationRead: async (id: string | null) => {
    mock.markReadCalls.push(id)
    return { ok: true }
  },
}))
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
      realtime: {
        setAuth: (token: string) => {
          mock.setAuthCalls.push(token)
        },
      },
      channel: (name: string) => {
        if (mock.setAuthCalls.length === 0) throw new Error('channel opened before setAuth')
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
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  mock.creds = { userId: 'user-1', accessToken: 'jwt-1' }
  mock.rows = []
  mock.unreadCount = 0
  mock.markReadCalls = []
  mock.setAuthCalls = []
  mock.handlers = {}
  mock.channelNames = []
  mock.subscribed = 0
  mock.loadCalls = 0
})

describe('NotificationBell', () => {
  it('renders nothing when there is no session, and asks for nothing else', async () => {
    mock.creds = null
    const { container } = render(<NotificationBell />)
    await flush()
    expect(container.firstChild).toBeNull()
    expect(mock.loadCalls).toBe(0)
    expect(mock.subscribed).toBe(0)
  })

  it('authenticates the socket with the access token before opening the channel', async () => {
    render(<NotificationBell />)
    await flush()
    expect(mock.setAuthCalls).toEqual(['jwt-1'])
    expect(mock.channelNames).toEqual(['bell:user-1'])
    expect(mock.subscribed).toBe(1)
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
    expect(screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('נוסף קאשבק לארנק')).toBeInTheDocument()
    expect(screen.getByText('₪42 נוספו לארנק שלך')).toBeInTheDocument()
    expect(screen.getByText('ההזמנה שלך נשלחה')).toBeInTheDocument()
  })

  it('shows the empty state when there are no rows', async () => {
    render(<NotificationBell />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'התראות' }))
    expect(screen.getByText(/אין התראות עדיין/)).toBeInTheDocument()
  })

  it('moves the UI on the INSERT handler the channel registered', async () => {
    render(<NotificationBell />)
    await flush()
    expect(mock.handlers.INSERT).toBeTypeOf('function')
    act(() => {
      mock.handlers.INSERT?.({ new: row({ id: 'n-9', title_he: 'קופון חדש' }), old: {} })
    })
    expect(screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('קופון חדש')).toBeInTheDocument()
  })

  it('decrements on another tab marking a row read, and only on the null to set edge', async () => {
    mock.rows = [row()]
    mock.unreadCount = 2
    render(<NotificationBell />)
    await flush()
    act(() => {
      mock.handlers.UPDATE?.({
        new: row({ read_at: '2026-10-01T00:00:00Z' }),
        old: { id: 'n-1', read_at: null },
      })
    })
    expect(screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' })).toBeInTheDocument()
    act(() => {
      mock.handlers.UPDATE?.({
        new: row({ read_at: '2026-10-01T00:00:01Z' }),
        old: { id: 'n-1', read_at: '2026-10-01T00:00:00Z' },
      })
    })
    expect(screen.getByRole('button', { name: 'התראות, 1 שלא נקראו' })).toBeInTheDocument()
  })

  it('marks everything read through the action when opened, and clears the badge at once', async () => {
    mock.rows = [row()]
    mock.unreadCount = 3
    render(<NotificationBell />)
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'התראות, 3 שלא נקראו' }))
    expect(mock.markReadCalls).toEqual([null])
    expect(screen.getByRole('button', { name: 'התראות' })).toBeInTheDocument()
    // Closing and reopening with nothing unread writes nothing.
    fireEvent.click(screen.getByRole('button', { name: 'התראות' }))
    fireEvent.click(screen.getByRole('button', { name: 'התראות' }))
    expect(mock.markReadCalls).toEqual([null])
  })
})
