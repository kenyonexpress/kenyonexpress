import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The purchase-page push offer stores the subscription through the
 * cookie-authed server action. It used to POST to /api/push/subscribe, which
 * wants a Bearer token this page never had, so every "yes" ended in a 401 and
 * an error line after the shopper had already granted permission.
 */

const save = vi.fn()
vi.mock('@/server/actions/push', () => ({ savePushSubscription: (i: unknown) => save(i) }))

import PushPrompt from './PushPrompt'

const P256DH = 'B'.repeat(87)
const AUTH = 'a'.repeat(22)
const unsubscribe = vi.fn()

beforeEach(() => {
  localStorage.clear()
  save.mockReset()
  unsubscribe.mockReset()
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BAAA')
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn(async () => 'granted'),
  })
  const subscription = {
    unsubscribe,
    toJSON: () => ({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: P256DH, auth: AUTH },
    }),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => ({
        pushManager: {
          getSubscription: vi.fn(async () => null),
          subscribe: vi.fn(async () => subscription),
        },
      })),
      register: vi.fn(),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('PushPrompt', () => {
  it('saves the subscription through the server action, never the Bearer route', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    save.mockResolvedValue({ success: true })
    render(<PushPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'הפעלת התראות' }))
    await screen.findByText(/נזכיר לך/)
    expect(save).toHaveBeenCalledWith({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: P256DH, auth: AUTH },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('undoes the browser subscription when the save is refused', async () => {
    save.mockResolvedValue({ error: 'nope' })
    render(<PushPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'הפעלת התראות' }))
    await screen.findByRole('alert')
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce())
  })
})
