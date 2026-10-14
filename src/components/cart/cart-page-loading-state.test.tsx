import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { act, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX27: what the cart page shows BEFORE the cart is known.
 *
 * Measured on a built server at 380 / 768 / 1440 (logs/ux27/before.json): a
 * shopper with a line in the cart read the yellow "your cart is empty" banner
 * for 1.5-2.0s on every visit, because the static page rendered the empty
 * state and the lines arrived from /api/cart afterwards. "Empty" is a
 * verdict; until the store is settled the page shows its skeleton, and it is
 * settled by the server's answer, by the device's fallback copy, or by a
 * mirror that has been read and says this device holds no cart.
 */

vi.mock('@/server/actions/cart', () => ({
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  removeUnavailableItems: vi.fn(),
  setShippingMethod: vi.fn(),
}))

// The parked-rows list opens IndexedDB; it has its own tests.
vi.mock('@/components/cart/SavedForLaterProvider', () => ({
  SavedForLaterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSavedForLaterStoreApi: () => null,
}))
vi.mock('@/components/cart/SavedForLaterList', () => ({ default: () => null }))

import type { CartStoreApi } from '@/lib/cart/store'
import { CART_MIRROR_KEY } from '@/lib/cart/store'
import CartPageView from './CartPageView'
import { CartProvider, useCartStoreApi } from './CartProvider'

const LINE = {
  product_id: '11111111-1111-4111-8111-111111111111',
  variant_id: null,
  quantity: 2,
  name_he: 'מקרר',
  slug: 'fridge',
  image_url: null,
  unit_price: agorot(250000),
  line_total: agorot(500000),
  type: 'physical',
  available: true,
  platform_fee: agorot(50000),
  supplier_due: agorot(450000),
  customer_pays_now: agorot(500000),
  balance_due_at_business: agorot(0),
  platform_percent_bp: 1000,
  platform_percent_snapshot: 10,
  coupon_price_unit: null,
  max_quantity: null,
  unavailable_reason: null,
} as unknown as CartViewItem

function cartOf(items: CartViewItem[]): CartView {
  return {
    ...EMPTY_CART,
    id: 'cart-1',
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

function mount() {
  captured = null
  render(
    <CartProvider>
      <Capture />
      <CartPageView />
    </CartProvider>,
  )
  return captured as unknown as CartStoreApi
}

const skeleton = () => document.querySelector('[data-cart-skeleton]')
const empty = () => document.querySelector('.cart-empty')

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the cart page before the cart is known (UX27)', () => {
  it('renders the skeleton, not the empty banner, in the server markup, where nothing has been read yet', () => {
    // The HTML every shopper receives: mirror unread, server unheard. It must
    // not pronounce the cart empty. (In the browser the provider reads the
    // mirror in an effect, so the next case is the first client state.)
    const html = renderToStaticMarkup(
      <CartProvider>
        <CartPageView />
      </CartProvider>,
    )
    expect(html).toContain('data-cart-skeleton')
    expect(html).not.toContain('cart-empty')
    expect(html).toContain('סל הקניות')
  })

  it('shows the empty state once the mirror has been read and says this device holds no cart', async () => {
    const store = mount()
    await act(async () => {
      await store.persist.rehydrate()
    })
    expect(store.persist.hasHydrated()).toBe(true)
    expect(skeleton()).toBeNull()
    expect(empty()).not.toBeNull()
  })

  it('keeps the skeleton when the mirror says there are lines, with one row per line up to three', async () => {
    localStorage.setItem(CART_MIRROR_KEY, JSON.stringify({ state: { mirrorCount: 2 }, version: 0 }))
    const store = mount()
    await act(async () => {
      await store.persist.rehydrate()
    })
    expect(empty()).toBeNull()
    expect(skeleton()).not.toBeNull()
    expect(document.querySelectorAll('[data-cart-skeleton] .cart-line')).toHaveLength(2)
  })

  it('swaps the skeleton for the lines when the server answers', async () => {
    localStorage.setItem(CART_MIRROR_KEY, JSON.stringify({ state: { mirrorCount: 2 }, version: 0 }))
    const store = mount()
    await act(async () => {
      await store.persist.rehydrate()
      store.getState().setCart(cartOf([LINE]))
    })
    expect(skeleton()).toBeNull()
    expect(empty()).toBeNull()
    expect(document.querySelectorAll('.cart-line')).toHaveLength(1)
    expect(document.querySelector('.cart-line__name')).toHaveTextContent('מקרר')
  })

  it('shows the empty state, not the skeleton, when the server confirms an empty cart against a stale mirror', async () => {
    localStorage.setItem(CART_MIRROR_KEY, JSON.stringify({ state: { mirrorCount: 4 }, version: 0 }))
    const store = mount()
    await act(async () => {
      await store.persist.rehydrate()
      store.getState().setCart(EMPTY_CART)
    })
    expect(skeleton()).toBeNull()
    expect(empty()).not.toBeNull()
  })

  it('treats the device fallback as an answer: restored lines are shown, not a skeleton', async () => {
    const store = mount()
    await act(async () => {
      store.getState().restoreFallback(cartOf([LINE]))
    })
    expect(skeleton()).toBeNull()
    expect(document.querySelectorAll('.cart-line')).toHaveLength(1)
  })
})
