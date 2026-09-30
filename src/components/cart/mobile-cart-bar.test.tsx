import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * On a phone the only way back to the cart was the icon in the header, and
 * the header is the first thing a shopper scrolls away from. The bar is the
 * cart kept in reach, and the rules asserted here are the ones that decide
 * when it must NOT be there: an empty cart, the cart and checkout routes,
 * and while the sheet is open over it.
 */

vi.mock('@/server/actions/cart', () => ({
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  removeUnavailableItems: vi.fn(),
  setShippingMethod: vi.fn(),
}))

const pathname = vi.hoisted(() => ({ current: '/' }))
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { useEffect } from 'react'
import { CartProvider, useCartStoreApi } from './CartProvider'
import MobileCartBar, { MOBILE_CART_BAR_CLASS, isMobileCartBarRoute } from './MobileCartBar'

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

function Patch({ state }: { state: Record<string, unknown> }) {
  const store = useCartStoreApi()
  useEffect(() => {
    store.setState(state as never)
  }, [store, state])
  return null
}

function renderBar(cart: CartView, state: Record<string, unknown> = {}) {
  return render(
    <CartProvider initialCart={cart} isAuthenticated>
      <Patch state={state} />
      <MobileCartBar />
    </CartProvider>,
  )
}

const bar = () => document.querySelector('[data-mobile-cart-bar]')

beforeEach(() => {
  pathname.current = '/'
  document.body.className = ''
  localStorage.clear()
})

describe('MobileCartBar', () => {
  it('renders the count and the subtotal when the cart has lines', () => {
    renderBar(cartOf([LINE]))
    expect(bar()).not.toBeNull()
    expect(screen.getByRole('button', { name: /2 פריטים בעגלה/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'המשך לתשלום' }).getAttribute('href')).toBe('/checkout')
    expect(document.body.classList.contains(MOBILE_CART_BAR_CLASS)).toBe(true)
  })

  it('is absent on an empty cart, and takes its body class with it', () => {
    renderBar(EMPTY_CART)
    expect(bar()).toBeNull()
    expect(document.body.classList.contains(MOBILE_CART_BAR_CLASS)).toBe(false)
  })

  it('opens the sheet from the summary press', () => {
    renderBar(cartOf([LINE]))
    fireEvent.click(screen.getByRole('button', { name: /פתח את העגלה/ }))
    // The sheet covers the bar, so the bar leaves with the class it set.
    expect(bar()).toBeNull()
    expect(document.body.classList.contains(MOBILE_CART_BAR_CLASS)).toBe(false)
  })

  it.each(['/cart', '/checkout', '/checkout/failed', '/account/orders', '/admin'])(
    'stays off %s',
    (route) => {
      pathname.current = route
      renderBar(cartOf([LINE]))
      expect(bar()).toBeNull()
    },
  )

  it('speaks for the badge before the server answers', () => {
    // Only the mirror knows there is a cart; the bar reads the same number
    // the header badge shows, so the two never disagree.
    renderBar(EMPTY_CART, { mirrorCount: 4, serverConfirmed: false })
    expect(screen.getByRole('button', { name: /4 פריטים בעגלה/ })).toBeTruthy()
  })

  it('refuses the checkout while a line is unavailable', () => {
    renderBar(
      cartOf([{ ...LINE, available: false, unavailable_reason: 'out_of_stock' } as CartViewItem]),
    )
    const link = screen.getByRole('link', { name: 'המשך לתשלום' })
    expect(link.getAttribute('aria-disabled')).toBe('true')
    expect(fireEvent.click(link)).toBe(false)
  })

  it('refuses the checkout on a cart restored from the device', async () => {
    renderBar(cartOf([LINE]))
    await act(async () => undefined)
    renderBar(cartOf([LINE]), { fallbackActive: true })
    const links = screen.getAllByRole('link', { name: 'המשך לתשלום' })
    expect(links.at(-1)?.getAttribute('aria-disabled')).toBe('true')
  })

  it('names one item in the singular', () => {
    renderBar(cartOf([{ ...LINE, quantity: 1 } as CartViewItem]))
    expect(screen.getByRole('button', { name: /1 פריט בעגלה/ })).toBeTruthy()
  })
})

describe('isMobileCartBarRoute', () => {
  it('allows shopping routes and refuses the cart, checkout, account and admin', () => {
    expect(isMobileCartBarRoute('/')).toBe(true)
    expect(isMobileCartBarRoute('/product/fridge')).toBe(true)
    expect(isMobileCartBarRoute('/category/kitchen')).toBe(true)
    expect(isMobileCartBarRoute('/cart')).toBe(false)
    expect(isMobileCartBarRoute('/checkout/return')).toBe(false)
    expect(isMobileCartBarRoute('/account')).toBe(false)
    expect(isMobileCartBarRoute('/login')).toBe(false)
    expect(isMobileCartBarRoute(null)).toBe(false)
    // A prefix, not a substring: /cartridges is a shop page.
    expect(isMobileCartBarRoute('/cartridges')).toBe(true)
  })
})
