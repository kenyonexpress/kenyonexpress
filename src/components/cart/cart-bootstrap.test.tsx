import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeIndexedDB, uninstallFakeIndexedDB } from '../../../test/fake-indexeddb'

/**
 * A FAILED BOOTSTRAP USED TO LEAVE A BADGE THAT SAID "3" OVER AN EMPTY CART.
 *
 * The item count survives a lost connection in the mirror; the lines did not
 * survive anywhere, so the PWA opened on a train showed a header that
 * promised a cart and a page that denied it. `CartBootstrap` now restores the
 * last confirmed cart from `lib/cart/local-fallback.ts` when `/api/cart`
 * fails, flagged so no checkout button honours it, and fetches again when the
 * browser reports `online`. The server's answer overwrites the snapshot every
 * time: that rule ("server cart wins on hydrate") is asserted here from both
 * sides.
 */

vi.mock('@/server/actions/cart', () => ({
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  removeUnavailableItems: vi.fn(),
  setShippingMethod: vi.fn(),
}))

import { writeCartFallback } from '@/lib/cart/local-fallback'
import type { CartStoreApi } from '@/lib/cart/store'
import { queueCartLine, readCartSyncQueue } from '@/lib/cart/sync-queue'
import CartBootstrap from './CartBootstrap'
import { CartProvider, useCartStoreApi } from './CartProvider'

const LINE = {
  product_id: '11111111-1111-4111-8111-111111111111',
  variant_id: null,
  quantity: 3,
  name_he: 'מקרר',
  slug: 'fridge',
  image_url: null,
  unit_price: agorot(250000),
  line_total: agorot(750000),
  type: 'physical',
  available: true,
  platform_fee: agorot(75000),
  supplier_due: agorot(675000),
  customer_pays_now: agorot(750000),
  balance_due_at_business: agorot(0),
  platform_percent_bp: 1000,
  platform_percent_snapshot: 10,
  coupon_price_unit: null,
  max_quantity: null,
  unavailable_reason: null,
} as unknown as CartViewItem

function cartOf(items: CartViewItem[], id = 'cart-1'): CartView {
  return {
    ...EMPTY_CART,
    id,
    items,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: agorot(items.reduce((s, i) => s + i.line_total, 0)),
  }
}

let captured: CartStoreApi | null = null
function Capture() {
  captured = useCartStoreApi()
  return null
}

const fetchMock = vi.fn()

function mount() {
  captured = null
  render(
    <CartProvider>
      <Capture />
      <CartBootstrap />
    </CartProvider>,
  )
  return captured as unknown as CartStoreApi
}

const flush = () => act(async () => undefined)

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('CartBootstrap when /api/cart answers', () => {
  it('puts the server cart in the store and ignores any snapshot', async () => {
    writeCartFallback(cartOf([{ ...LINE, quantity: 9 }]))
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ cart: cartOf([LINE]), isAuthenticated: true }),
    })
    const store = mount()
    await flush()

    const state = store.getState()
    expect(state.cart.item_count).toBe(3)
    expect(state.isAuthenticated).toBe(true)
    expect(state.serverConfirmed).toBe(true)
    expect(state.fallbackActive).toBe(false)
  })
})

describe('CartBootstrap when /api/cart fails', () => {
  it('restores the last confirmed cart, flagged as the device copy', async () => {
    writeCartFallback(cartOf([LINE]))
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const store = mount()
    await flush()

    const state = store.getState()
    expect(state.cart.items).toHaveLength(1)
    expect(state.cart.item_count).toBe(3)
    expect(state.fallbackActive).toBe(true)
    expect(state.serverConfirmed).toBe(false)
  })

  it('treats a server error the same as no network', async () => {
    writeCartFallback(cartOf([LINE]))
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    const store = mount()
    await flush()
    expect(store.getState().fallbackActive).toBe(true)
  })

  it('shows nothing when there is no snapshot, as before', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const store = mount()
    await flush()
    expect(store.getState().cart.items).toHaveLength(0)
    expect(store.getState().fallbackActive).toBe(false)
  })

  it('fetches again on online, and the server then wins over the snapshot', async () => {
    writeCartFallback(cartOf([{ ...LINE, quantity: 9 }]))
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cart: cartOf([LINE]), isAuthenticated: false }),
    })
    const store = mount()
    await flush()
    expect(store.getState().fallbackActive).toBe(true)
    expect(store.getState().cart.item_count).toBe(9)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(store.getState().fallbackActive).toBe(false)
    expect(store.getState().cart.item_count).toBe(3)
    expect(store.getState().serverConfirmed).toBe(true)
  })

  it('does not fetch again on online once the server has answered', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ cart: cartOf([LINE]), isAuthenticated: false }),
    })
    mount()
    await flush()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

/**
 * THE PAGE HALF OF THE OFFLINE REPLAY. Where the browser has no Background
 * Sync (jsdom here, every WebKit browser in the field) this component posts
 * the queue itself, on mount and on `online`; where the worker does it, the
 * result arrives as a `message` and lands through the same store call.
 */
describe('CartBootstrap replays the offline cart queue', () => {
  const P1 = '11111111-1111-4111-8111-111111111111'
  const synced = cartOf([{ ...LINE, product_id: P1, quantity: 2 }], 'cart-synced')

  /** Answers by URL, so the bootstrap read and the replay can be scripted apart. */
  function network(answers: Record<string, () => Promise<unknown>>) {
    fetchMock.mockImplementation(async (url: string) => {
      const answer = answers[url]
      if (!answer) throw new Error(`unexpected fetch ${url}`)
      return answer()
    })
  }
  const ok = (body: unknown) => async () => ({ ok: true, json: async () => body })
  const serverCart = { cart: cartOf([LINE]), isAuthenticated: false }

  beforeEach(() => {
    installFakeIndexedDB()
  })
  afterEach(() => {
    uninstallFakeIndexedDB()
    vi.unstubAllGlobals()
  })

  it('seeds the checkout guard from the queue, replays it, and takes the replayed cart', async () => {
    await queueCartLine(P1, null, 2)
    network({
      '/api/cart': ok(serverCart),
      '/api/cart/sync': ok({ ok: true, cart: synced, rejected: [] }),
    })

    const store = mount()
    await flush()
    await flush()

    const state = store.getState()
    expect(state.queuedLines).toBe(0)
    expect(state.cart.id).toBe('cart-synced')
    expect(state.serverConfirmed).toBe(true)
    expect(await readCartSyncQueue()).toEqual([])
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/cart/sync')
  })

  it('never lets the bootstrap read paint over a queue that is still waiting', async () => {
    await queueCartLine(P1, null, 2)
    network({
      '/api/cart': ok(serverCart),
      '/api/cart/sync': async () => {
        throw new TypeError('Failed to fetch')
      },
    })

    const store = mount()
    await flush()
    await flush()

    const state = store.getState()
    expect(state.queuedLines).toBe(1)
    // The server's cart was fetched and deliberately not applied: it does not
    // hold the queued line, and the replay's answer will.
    expect(state.serverCart.id).toBeNull()
    expect(await readCartSyncQueue()).toHaveLength(1)
  })

  it('replays again on online', async () => {
    await queueCartLine(P1, null, 2)
    let syncUp = false
    network({
      '/api/cart': ok(serverCart),
      '/api/cart/sync': async () => {
        if (!syncUp) throw new TypeError('Failed to fetch')
        return { ok: true, json: async () => ({ ok: true, cart: synced, rejected: [] }) }
      },
    })
    const store = mount()
    await flush()
    expect(store.getState().queuedLines).toBe(1)

    syncUp = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await flush()

    expect(store.getState().queuedLines).toBe(0)
    expect(store.getState().cart.id).toBe('cart-synced')
  })

  it("takes the worker's synced cart from a message", async () => {
    const worker = new EventTarget()
    vi.stubGlobal('navigator', { onLine: true, serviceWorker: worker })
    network({ '/api/cart': ok(serverCart) })
    const store = mount()
    await flush()

    await act(async () => {
      worker.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'ke:cart-synced', cart: synced, rejected: [] },
        }),
      )
    })

    expect(store.getState().cart.id).toBe('cart-synced')
    expect(store.getState().queuedLines).toBe(0)
  })

  it("clears the guard and re-reads the cart on the worker's failure message", async () => {
    const worker = new EventTarget()
    vi.stubGlobal('navigator', { onLine: true, serviceWorker: worker })
    await queueCartLine(P1, null, 2)
    network({
      '/api/cart': ok(serverCart),
      '/api/cart/sync': async () => ({ ok: false, status: 403, json: async () => ({}) }),
    })
    const store = mount()
    await flush()
    await flush()
    expect(store.getState().queuedLines).toBe(0)

    store
      .getState()
      .seedQueued([{ key: `${P1}|`, product_id: P1, variant_id: null, quantity: 2, at: 1 }])
    const reads = fetchMock.mock.calls.filter(([url]) => url === '/api/cart').length
    await act(async () => {
      worker.dispatchEvent(
        new MessageEvent('message', { data: { type: 'ke:cart-sync-failed', status: 403 } }),
      )
    })

    expect(store.getState().queuedLines).toBe(0)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/cart').length).toBe(reads + 1)
  })
})
