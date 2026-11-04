import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { update } = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('@/server/actions/push', () => ({ updatePushTopics: update }))

import PushTopicsSwitch from './PushTopicsSwitch'

const MINE = 'https://fcm.googleapis.com/fcm/send/mine'
const OTHER = 'https://fcm.googleapis.com/fcm/send/other'

function withBrowserEndpoint(endpoint: string | null) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => (endpoint ? { endpoint } : null) },
      }),
    },
  })
}

async function renderSwitch(
  devices: { endpoint: string; topics: ('order_updates' | 'expiry')[] }[],
) {
  await act(async () => {
    render(<PushTopicsSwitch devices={devices} />)
  })
}

describe('PushTopicsSwitch (S21)', () => {
  beforeEach(() => update.mockReset())
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('renders nothing when this browser has no stored subscription', async () => {
    withBrowserEndpoint(MINE)
    await renderSwitch([{ endpoint: OTHER, topics: ['order_updates', 'expiry'] }])
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it("shows THIS browser's topics, not another browser's", async () => {
    withBrowserEndpoint(MINE)
    await renderSwitch([
      { endpoint: OTHER, topics: ['order_updates', 'expiry'] },
      { endpoint: MINE, topics: ['expiry'] },
    ])
    const [orders, expiry] = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(orders?.checked).toBe(false)
    expect(expiry?.checked).toBe(true)
  })

  it('saves the new topic list for this endpoint', async () => {
    update.mockResolvedValue({ success: true })
    withBrowserEndpoint(MINE)
    await renderSwitch([{ endpoint: MINE, topics: ['order_updates', 'expiry'] }])
    await act(async () => {
      fireEvent.click(screen.getAllByRole('checkbox')[1] as HTMLElement)
    })
    expect(update).toHaveBeenCalledWith(MINE, ['order_updates'])
  })

  it('reverts the box and says so when the save is refused', async () => {
    update.mockResolvedValue({ error: 'צריך להתחבר כדי להפעיל התראות' })
    withBrowserEndpoint(MINE)
    await renderSwitch([{ endpoint: MINE, topics: ['order_updates', 'expiry'] }])
    await act(async () => {
      fireEvent.click(screen.getAllByRole('checkbox')[0] as HTMLElement)
    })
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('להתחבר')
  })
})
