/**
 * @vitest-environment jsdom
 */
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The whole contract is three lines long, so the tests are about the edges:
 * the id and ONLY the id crosses, a signed-out answer clears rather than
 * lingers, and an unmount before the answer arrives tags nothing.
 *
 * Since STEP 18 the id comes from the `currentUserId` Server Action (the
 * session cookie is HttpOnly, so no browser client can read it), scheduled
 * after an idle callback (a 0ms timeout under jsdom, which has no
 * requestIdleCallback), so nothing is asked on the same tick as render.
 */

const setUser = vi.hoisted(() => vi.fn())
vi.mock('@sentry/nextjs', () => ({
  setUser: (...args: unknown[]) => setUser(...args),
}))

const session = vi.hoisted(() => ({
  answer: null as string | null,
  calls: 0,
  resolve: null as null | ((id: string | null) => void),
}))

vi.mock('@/server/actions/session', () => ({
  currentUserId: () => {
    session.calls += 1
    return new Promise<string | null>((resolve) => {
      session.resolve = resolve
      if (session.answer !== undefined) resolve(session.answer)
    })
  },
}))

import SentryUserSync from './SentryUserSync'

describe('SentryUserSync', () => {
  beforeEach(() => {
    setUser.mockReset()
    session.answer = null
    session.calls = 0
    session.resolve = null
  })

  const asked = () => waitFor(() => expect(session.calls).toBeGreaterThan(0))

  it('renders nothing and asks the server after the idle tick, not on render', async () => {
    const { container } = render(<SentryUserSync />)
    expect(container.innerHTML).toBe('')
    expect(session.calls).toBe(0)
    await asked()
  })

  it('forwards the id and only the id', async () => {
    session.answer = 'uuid-1'
    render(<SentryUserSync />)
    await waitFor(() => expect(setUser).toHaveBeenCalledWith({ id: 'uuid-1' }))
    const sent = setUser.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(sent)).toEqual(['id'])
  })

  it('clears the user on a signed-out answer instead of leaving the last one attached', async () => {
    session.answer = null
    render(<SentryUserSync />)
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(null))
  })

  it('tags nothing when unmounted before the answer arrives', async () => {
    session.answer = undefined as unknown as null
    const { unmount } = render(<SentryUserSync />)
    await asked()
    unmount()
    session.resolve?.('uuid-late')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(setUser).not.toHaveBeenCalled()
  })

  it('never asks when unmounted before the idle tick', async () => {
    const { unmount } = render(<SentryUserSync />)
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(session.calls).toBe(0)
  })
})
