import { CartProvider } from '@/components/cart/CartProvider'
import CartTotalsSidebar from '@/components/cart/CartTotalsSidebar'
import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * The bundle savings row in the cart summary (STEP 60). Pinned: one named
 * row per completed set with the set count when it repeats, the amount as
 * a negative, nothing when no set is complete, and the total under it is
 * the server's `total`, which already has the saving taken off.
 */

vi.mock('@/server/actions/cart', () => ({
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  removeUnavailableItems: vi.fn(),
  applyCouponCode: vi.fn(),
  removeCouponCode: vi.fn(),
  setShippingMethod: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const LINE: CartViewItem = {
  product_id: 'p1',
  variant_id: null,
  quantity: 1,
  name_he: 'מוצר',
  slug: 'p1',
  image_url: null,
  unit_price: agorot(30_000),
  line_total: agorot(30_000),
  type: 'physical',
  available: true,
  platform_fee: agorot(3_000),
  supplier_due: agorot(27_000),
  customer_pays_now: agorot(30_000),
  balance_due_at_business: agorot(0),
  cashback: agorot(0),
  platform_percent_bp: 1000,
  platform_percent_snapshot: 10,
  coupon_price_unit: null,
  max_quantity: null,
  unavailable_reason: null,
}

function cart(overrides: Partial<CartView>): CartView {
  return {
    ...EMPTY_CART,
    id: 'cart-1',
    items: [LINE],
    item_count: 1,
    subtotal: agorot(30_000),
    shipping: { method: 'supplier_delivery', label: 'משלוח עד הבית', cost: agorot(0) },
    total: agorot(30_000),
    ...overrides,
  }
}

function mount(view: CartView) {
  return render(
    <CartProvider initialCart={view}>
      <CartTotalsSidebar cart={view} />
    </CartProvider>,
  )
}

describe('the cart bundle savings row', () => {
  it('is absent when no set is complete', () => {
    mount(cart({}))
    expect(screen.queryByTestId('cart-bundle-row')).toBeNull()
  })

  it('names the set, shows the saving as a negative, and the total already reflects it', () => {
    mount(
      cart({
        bundles: [{ id: 'b1', name_he: 'ספל וצלחת', times: 1, discount: agorot(1_500) }],
        bundle_discount: agorot(1_500),
        total: agorot(28_500),
      }),
    )
    const row = screen.getByTestId('cart-bundle-row')
    expect(row.textContent).toContain('חיסכון חבילה: ספל וצלחת')
    expect(row.textContent).not.toContain('×')
    expect(row.textContent).toMatch(/-.*15\.00.*₪/)
    expect(screen.getByText('לתשלום באתר').nextElementSibling?.textContent).toMatch(/285\.00/)
  })

  it('shows the set count when the cart holds the set more than once', () => {
    mount(
      cart({
        bundles: [
          { id: 'b1', name_he: 'ספל וצלחת', times: 2, discount: agorot(3_000) },
          { id: 'b2', name_he: 'קערה וכף', times: 1, discount: agorot(500) },
        ],
        bundle_discount: agorot(3_500),
        total: agorot(26_500),
      }),
    )
    const rows = screen.getAllByTestId('cart-bundle-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('ספל וצלחת ×2')
    expect(rows[1]?.textContent).toContain('קערה וכף')
  })
})
