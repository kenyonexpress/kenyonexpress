/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The whole contract is three lines long, so the tests are about the edges:
 * the id and ONLY the id crosses, sign-out clears rather than lingers, and
 * unmount detaches the listener instead of leaking it into the next page.
 */

const setUser = vi.hoisted(() => vi.fn())
vi.mock('@sentry/nextjs', () => ({
  setUser: (...args: unknown[]) => setUser(...args),
}))

type AuthCallback = (
  event: string,
  session: { user: { id: string; email?: string } } | null,
) => void

const auth = vi.hoisted(() => ({
  callback: null as AuthCallback | null,
  unsubscribe: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        auth.callback = cb
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } }
      },
    },
  }),
}))

import SentryUserSync from './SentryUserSync'

describe('SentryUserSync', () => {
  beforeEach(() => {
    setUser.mockReset()
    auth.callback = null
    auth.unsubscribe.mockReset()
  })

  it('renders nothing and subscribes', () => {
    const { container } = render(<SentryUserSync />)
    expect(container.innerHTML).toBe('')
    expect(auth.callback).not.toBeNull()
  })

  it('forwards the id and only the id, never the email on the same object', () => {
    render(<SentryUserSync />)
    auth.callback?.('INITIAL_SESSION', { user: { id: 'uuid-1', email: 'ofir@example.com' } })

    expect(setUser).toHaveBeenCalledWith({ id: 'uuid-1' })
    const sent = setUser.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(sent)).toEqual(['id'])
  })

  it('clears the user on sign-out instead of leaving the last one attached', () => {
    render(<SentryUserSync />)
    auth.callback?.('SIGNED_IN', { user: { id: 'uuid-1' } })
    auth.callback?.('SIGNED_OUT', null)

    expect(setUser).toHaveBeenLastCalledWith(null)
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<SentryUserSync />)
    unmount()
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
