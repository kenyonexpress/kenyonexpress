import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The center's client contract. Pinned: the tabs are links carrying the
 * shelf in the URL with the unread counter beside each; mark-all sends the
 * selected shelf (null on "all") and clears the rows in hand at once; a
 * failed mark-all puts the rows back and says so; a row click marks that one
 * row; a muted shelf reads as muted, not as empty.
 */

const mock = vi.hoisted(() => ({
  markAllCalls: [] as (string | null)[],
  markOneCalls: [] as string[],
  markAllResult: { ok: true } as { ok: boolean; error?: string },
  refreshes: 0,
}))

vi.mock('@/server/actions/notifications', () => ({
  markAllNotificationsRead: async (category: string | null) => {
    mock.markAllCalls.push(category)
    return mock.markAllResult
  },
  markNotificationRead: async (id: string) => {
    mock.markOneCalls.push(id)
    return { ok: true }
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {
      mock.refreshes += 1
    },
  }),
}))

import NotificationCenter from './NotificationCenter'

const counts = {
  orders: { total: 2, unread: 1 },
  deals: { total: 1, unread: 1 },
  account: { total: 0, unread: 0 },
  system: { total: 0, unread: 0 },
}

function row(id: string, kind: string, readAt: string | null = null) {
  return {
    id,
    kind,
    titleHe: `כותרת ${id}`,
    bodyHe: null,
    href: '/account/orders',
    readAt,
    createdAt: '2026-10-08T06:00:00Z',
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  mock.markAllCalls = []
  mock.markOneCalls = []
  mock.markAllResult = { ok: true }
  mock.refreshes = 0
})

describe('NotificationCenter', () => {
  it('renders the shelves as links with the unread counter beside each', () => {
    render(<NotificationCenter rows={[]} counts={counts} selected={null} muted={[]} />)
    const all = screen.getByRole('link', { name: /הכל/ })
    expect(all).toHaveAttribute('href', '/account/notifications')
    expect(all).toHaveAttribute('aria-current', 'page')
    expect(all).toHaveTextContent('2')
    const orders = screen.getByRole('link', { name: /הזמנות/ })
    expect(orders).toHaveAttribute('href', '/account/notifications?category=orders')
    expect(orders).toHaveTextContent('1')
    expect(screen.getByRole('link', { name: /חשבון/ })).not.toHaveTextContent(/\d/)
  })

  it('marks every shelf read on the all tab and clears the rows at once', async () => {
    render(
      <NotificationCenter
        rows={[row('a', 'order_paid'), row('b', 'price_drop', '2026-10-01T00:00:00Z')]}
        counts={counts}
        selected={null}
        muted={[]}
      />,
    )
    expect(screen.getAllByLabelText('לא נקרא')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'סמן הכל כנקרא' }))
    await flush()
    expect(mock.markAllCalls).toEqual([null])
    expect(screen.queryByLabelText('לא נקרא')).toBeNull()
    expect(mock.refreshes).toBe(1)
  })

  it('scopes mark-all to the selected shelf', async () => {
    render(
      <NotificationCenter
        rows={[row('a', 'price_drop')]}
        counts={counts}
        selected="deals"
        muted={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'סמן את מבצעים כנקרא' }))
    await flush()
    expect(mock.markAllCalls).toEqual(['deals'])
  })

  it('puts the rows back and reports when mark-all fails', async () => {
    mock.markAllResult = { ok: false, error: 'העדכון נכשל.' }
    render(
      <NotificationCenter
        rows={[row('a', 'order_paid')]}
        counts={counts}
        selected={null}
        muted={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'סמן הכל כנקרא' }))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('העדכון נכשל.')
    expect(screen.getAllByLabelText('לא נקרא')).toHaveLength(1)
    expect(mock.refreshes).toBe(0)
  })

  it('marks one row read on click, through the single-id action', () => {
    render(
      <NotificationCenter
        rows={[row('a', 'order_paid')]}
        counts={counts}
        selected={null}
        muted={[]}
      />,
    )
    const link = screen.getByRole('link', { name: /כותרת a/ })
    // jsdom cannot navigate; the handler under test runs before the default.
    link.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(link)
    expect(mock.markOneCalls).toEqual(['a'])
    expect(screen.queryByLabelText('לא נקרא')).toBeNull()
  })

  it('reads as muted, not empty, on a muted shelf', () => {
    render(<NotificationCenter rows={[]} counts={counts} selected="deals" muted={['deals']} />)
    expect(screen.getByText(/הקטגוריה הזו מושתקת/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /מבצעים/ })).toHaveTextContent('מושתק')
  })

  it('shows the shelf chip on every row', () => {
    render(
      <NotificationCenter
        rows={[row('a', 'cashback_credited')]}
        counts={counts}
        selected={null}
        muted={[]}
      />,
    )
    expect(screen.getByRole('link', { name: /כותרת a/ })).toHaveTextContent('חשבון')
  })
})
