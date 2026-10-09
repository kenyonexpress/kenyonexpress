/**
 * @vitest-environment jsdom
 */
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The whole contract is three lines long, so the tests are about the edges:
 * the id and ONLY the id crosses, sign-out clears rather than lingers, and
 * unmount detaches the listener instead of leaking it into the next page.
 *
 * Every test waits for the subscription. Since 2026-09-17 the component
 * imports the Supabase client lazily, after an idle callback (a 0ms timeout
 * under jsdom, which has no requestIdleCallback), so nothing is subscribed on
 * the same tick as render. Four tests here went red on that change while
 * asserting synchronously against a listener that had not been attached yet.
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

  const subscribed = () => waitFor(() => expect(auth.callback).not.toBeNull())

  it('renders nothing and subscribes', async () => {
    const { container } = render(<SentryUserSync />)
    expect(container.innerHTML).toBe('')
    // Not on the render tick: the client is imported after the idle callback.
    expect(auth.callback).toBeNull()
    await subscribed()
  })

  it('forwards the id and only the id, never the email on the same object', async () => {
    render(<SentryUserSync />)
    await subscribed()
    auth.callback?.('INITIAL_SESSION', { user: { id: 'uuid-1', email: 'ofir@example.com' } })

    expect(setUser).toHaveBeenCalledWith({ id: 'uuid-1' })
    const sent = setUser.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(sent)).toEqual(['id'])
  })

  it('clears the user on sign-out instead of leaving the last one attached', async () => {
    render(<SentryUserSync />)
    await subscribed()
    auth.callback?.('SIGNED_IN', { user: { id: 'uuid-1' } })
    auth.callback?.('SIGNED_OUT', null)

    expect(setUser).toHaveBeenLastCalledWith(null)
  })

  it('unsubscribes on unmount', async () => {
    const { unmount } = render(<SentryUserSync />)
    await subscribed()
    unmount()
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('never subscribes when unmounted before the client arrives', async () => {
    // A navigation away during the deferred import must not leave a listener
    // attached to a component that no longer exists.
    const { unmount } = render(<SentryUserSync />)
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(auth.callback).toBeNull()
    expect(auth.unsubscribe).not.toHaveBeenCalled()
  })
})
