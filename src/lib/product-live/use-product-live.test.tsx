import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The hook's wiring, with the socket mocked out.
 *
 * Delivery itself (partition present, topic reachable, payload shape) is
 * proven against production by scripts/verify-product-live.mjs. What can
 * regress here without any of that is the handler registration: the exact
 * event name, the topic string, the parse-then-apply order, and the teardown.
 */

type BroadcastHandler = (message: { payload: unknown }) => void

const mock = vi.hoisted(() => ({
  handlers: [] as { event: string; cb: BroadcastHandler }[],
  topics: [] as string[],
  subscribed: 0,
  removed: 0,
  throwOnCreate: false,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    if (mock.throwOnCreate) throw new Error('no anon key')
    const channel = {
      on: (_type: string, cfg: { event: string }, cb: BroadcastHandler) => {
        mock.handlers.push({ event: cfg.event, cb })
        return channel
      },
      subscribe: () => {
        mock.subscribed += 1
        return channel
      },
    }
    return {
      channel: (topic: string) => {
        mock.topics.push(topic)
        return channel
      },
      removeChannel: async () => {
        mock.removed += 1
        return 'ok' as const
      },
    }
  },
}))

import { useProductLive } from './use-product-live'

const ID = '11111111-1111-4111-8111-111111111111'
const BASE = { stock: 10, price: 150, oldPrice: 200 }

// The browser client is imported lazily (STEP 34): the subscription lands a
// microtask after the first render, so every delivery waits for it first.
async function deliver(payload: unknown) {
  await waitFor(() => expect(mock.handlers.length).toBeGreaterThan(0))
  act(() => {
    for (const h of mock.handlers) h.cb({ payload })
  })
}

describe('useProductLive', () => {
  beforeEach(() => {
    mock.handlers.length = 0
    mock.topics.length = 0
    mock.subscribed = 0
    mock.removed = 0
    mock.throwOnCreate = false
  })

  it('subscribes to product:<id> for the live event and starts from the cache', async () => {
    const { result } = renderHook(() => useProductLive(ID, BASE))
    await waitFor(() => expect(mock.topics).toEqual([`product:${ID}`]))
    expect(mock.handlers.map((h) => h.event)).toEqual(['live'])
    expect(mock.subscribed).toBe(1)
    expect(result.current).toEqual({ ...BASE, onSale: true, live: false })
  })

  it('applies a trigger payload to stock, price and strike-through', async () => {
    const { result } = renderHook(() => useProductLive(ID, BASE))
    await deliver({
      product_id: ID,
      stock_quantity: 3,
      available: 2,
      kenyon_price: 120,
      full_price: 180,
      status: 'active',
      deleted_at: null,
    })
    expect(result.current).toEqual({
      stock: 2,
      price: 120,
      oldPrice: 180,
      onSale: true,
      live: true,
    })
  })

  it('ignores a malformed message and one about another product', async () => {
    const { result } = renderHook(() => useProductLive(ID, BASE))
    await deliver({ hello: 'world' })
    await deliver({
      product_id: '22222222-2222-4222-8222-222222222222',
      stock_quantity: 0,
      available: 0,
      kenyon_price: 1,
      full_price: null,
      status: 'active',
      deleted_at: null,
    })
    expect(result.current).toEqual({ ...BASE, onSale: true, live: false })
  })

  it('removes the channel on unmount', async () => {
    const { unmount } = renderHook(() => useProductLive(ID, BASE))
    await waitFor(() => expect(mock.subscribed).toBe(1))
    unmount()
    expect(mock.removed).toBe(1)
  })

  it('subscribes nothing when unmounted before the client chunk arrives', async () => {
    const { unmount } = renderHook(() => useProductLive(ID, BASE))
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mock.topics).toEqual([])
    expect(mock.subscribed).toBe(0)
    expect(mock.removed).toBe(0)
  })

  it('is inert when no client can be built', async () => {
    mock.throwOnCreate = true
    const { result, unmount } = renderHook(() => useProductLive(ID, BASE))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(result.current).toEqual({ ...BASE, onSale: true, live: false })
    unmount()
    expect(mock.removed).toBe(0)
  })
})
