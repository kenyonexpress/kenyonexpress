import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * V01: /cart as Electro's table. Pins the three things the visual rebuild
 * must not lose: the WooCommerce column set, whole-shekel prices, and the
 * loading state that replaced a false "your cart is empty" while the server
 * cart was still on its way.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('@/server/actions/cart', () => ({
  applyCouponCode: vi.fn(),
  removeCouponCode: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/cart',
  useRouter: () => ({ refresh: vi.fn() }),
}))

import type { CartView, CartViewItem } from '@/lib/cart/types'
import { EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { useEffect } from 'react'
import CartPageView from './CartPageView'
import { CartProvider, useCartStoreApi } from './CartProvider'

const LINE = {
  product_id: '11111111-1111-4111-8111-111111111111',
  variant_id: null,
  quantity: 2,
  name_he: 'מקרר',
  slug: 'fridge',
  image_url: null,
  // 1,249.50 a unit: the display has to round, the store must not.
  unit_price: agorot(124950),
  line_total: agorot(249900),
  type: 'physical',
  available: true,
  platform_fee: agorot(24990),
  supplier_due: agorot(224910),
  customer_pays_now: agorot(249900),
  balance_due_at_business: agorot(0),
  platform_percent_bp: 1000,
  platform_percent_snapshot: 10,
  coupon_price_unit: null,
  max_quantity: null,
  unavailable_reason: null,
} as unknown as CartViewItem

const CART = {
  id: 'cart-1',
  items: [LINE],
  item_count: 2,
  subtotal: agorot(249900),
  platform_fee: agorot(24990),
  supplier_due: agorot(224910),
  balance_due_at_business: agorot(0),
  coupon: null,
  discount: agorot(0),
  total: agorot(249900),
} as unknown as CartView

function Seed({ state }: { state: Record<string, unknown> }) {
  const store = useCartStoreApi()
  useEffect(() => {
    store.setState(state)
  }, [store, state])
  return null
}

describe('/cart', () => {
  it('renders the Electro column set', () => {
    render(
      <CartProvider initialCart={CART} isAuthenticated>
        <CartPageView />
      </CartProvider>,
    )
    // The first table is the cart; the second is the totals box.
    const [table] = screen.getAllByRole('table') as [HTMLElement]
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
    expect(headers).toEqual(['הסרה', 'תמונה', 'מוצר', 'מחיר', 'כמות', 'סה״כ'])
    expect(within(table).getByRole('button', { name: 'הסר מקרר מהעגלה' })).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'הוסף כמות' })).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'הפחת כמות' })).toBeTruthy()
  })

  it('prints whole shekels, never agorot', () => {
    const { container } = render(
      <CartProvider initialCart={CART} isAuthenticated>
        <CartPageView />
      </CartProvider>,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('1,250')
    expect(text).toContain('2,499')
    expect(text).not.toMatch(/\d\.\d{2}/)
  })

  it('keeps the totals box the e2e specs find by name', () => {
    render(
      <CartProvider initialCart={CART} isAuthenticated>
        <CartPageView />
      </CartProvider>,
    )
    const summary = screen.getByRole('complementary', { name: 'סיכום הזמנה' })
    expect(within(summary).getByText('לתשלום באתר')).toBeTruthy()
    expect(within(summary).getByRole('link', { name: 'המשך לתשלום' })).toBeTruthy()
  })

  it('says loading, not empty, while a remembered cart is on its way', () => {
    render(
      <CartProvider initialCart={EMPTY_CART} isAuthenticated={false}>
        <Seed state={{ mirrorCount: 1, serverConfirmed: false }} />
        <CartPageView />
      </CartProvider>,
    )
    expect(screen.queryByText('סל הקניות שלך ריק כרגע.')).toBeNull()
    expect(screen.getByText('טוען את הסל...')).toBeTruthy()
  })

  it('says empty once the server has answered with nothing', () => {
    render(
      <CartProvider initialCart={EMPTY_CART} isAuthenticated={false}>
        <Seed state={{ mirrorCount: 0, serverConfirmed: true }} />
        <CartPageView />
      </CartProvider>,
    )
    expect(screen.getByText('סל הקניות שלך ריק כרגע.')).toBeTruthy()
  })
})
