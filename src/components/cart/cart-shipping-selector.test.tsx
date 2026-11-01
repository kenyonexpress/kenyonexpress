import { CartProvider, useCart } from '@/components/cart/CartProvider'
import CartTotalsSidebar from '@/components/cart/CartTotalsSidebar'
import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The shipping selector is a radiogroup whose checked option is the STORE's
 * answer and nothing else. What these tests hold:
 *
 *  - a coupon-only cart gets no selector and no shipping row at all;
 *  - a physical cart renders one option per registered method, the server's
 *    choice checked;
 *  - a press moves the radio at once and sends the id to the server action;
 *  - a refused write moves the radio BACK, because the store rolled the cart
 *    back and the radio has no state of its own to disagree with it.
 */

const setShippingMethod = vi.fn()

vi.mock('@/server/actions/cart', () => ({
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  removeUnavailableItems: vi.fn(),
  applyCouponCode: vi.fn(),
  removeCouponCode: vi.fn(),
  setShippingMethod: (...args: unknown[]) => setShippingMethod(...args),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function line(overrides: Partial<CartViewItem> = {}): CartViewItem {
  return {
    product_id: 'p1',
    variant_id: null,
    quantity: 1,
    name_he: 'מוצר',
    slug: 'p1',
    image_url: null,
    unit_price: agorot(10_000),
    line_total: agorot(10_000),
    type: 'physical',
    available: true,
    platform_fee: agorot(1_000),
    supplier_due: agorot(9_000),
    customer_pays_now: agorot(10_000),
    balance_due_at_business: agorot(0),
    platform_percent_bp: 1000,
    platform_percent_snapshot: 10,
    coupon_price_unit: null,
    max_quantity: null,
    unavailable_reason: null,
    ...overrides,
  }
}

function physicalCart(method: 'supplier_delivery' | 'pickup' = 'supplier_delivery'): CartView {
  return {
    ...EMPTY_CART,
    id: 'cart-1',
    items: [line()],
    item_count: 1,
    subtotal: agorot(10_000),
    shipping: {
      method,
      label: method === 'pickup' ? 'איסוף עצמי מהספק' : 'משלוח עד הבית',
      cost: agorot(0),
    },
    total: agorot(10_000),
  }
}

function couponOnlyCart(): CartView {
  return {
    ...EMPTY_CART,
    id: 'cart-2',
    items: [line({ type: 'coupon', coupon_price_unit: agorot(2_000) })],
    item_count: 1,
    subtotal: agorot(2_000),
    shipping: null,
    total: agorot(2_000),
  }
}

function mount(cart: CartView) {
  return render(
    <CartProvider initialCart={cart}>
      <CartTotalsSidebar cart={cart} />
    </CartProvider>,
  )
}

/**
 * The sidebar takes the cart as a prop, so a store change does not re-render
 * it by itself. This wrapper reads the store like the page does.
 */
function SidebarFromStore() {
  const { cart } = useCart()
  return <CartTotalsSidebar cart={cart} />
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('CartShippingSelector', () => {
  it('asks nothing of a coupon-only cart', () => {
    mount(couponOnlyCart())
    expect(screen.queryByRole('group', { name: 'אופן המשלוח' })).toBeNull()
    expect(screen.queryByTestId('cart-shipping-row')).toBeNull()
  })

  it('offers every registered method with the server choice checked, and shows the rate row', () => {
    mount(physicalCart('pickup'))

    const group = screen.getByRole('group', { name: 'אופן המשלוח' })
    expect(group).toBeInTheDocument()

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /איסוף עצמי מהספק/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /משלוח עד הבית/ })).not.toBeChecked()

    const row = screen.getByTestId('cart-shipping-row')
    expect(row).toHaveTextContent('משלוח (איסוף עצמי מהספק)')
    expect(row).toHaveTextContent('חינם')
  })

  it('moves the radio on the press and sends the id to the server', async () => {
    setShippingMethod.mockResolvedValue({ ok: true, cart: physicalCart('pickup') })
    render(
      <CartProvider initialCart={physicalCart('supplier_delivery')}>
        <SidebarFromStore />
      </CartProvider>,
    )

    fireEvent.click(screen.getByRole('radio', { name: /איסוף עצמי מהספק/ }))

    expect(setShippingMethod).toHaveBeenCalledWith('pickup')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /איסוף עצמי מהספק/ })).toBeChecked(),
    )
    expect(screen.getByTestId('cart-shipping-row')).toHaveTextContent('איסוף עצמי מהספק')
  })

  it('snaps the radio back when the server refuses', async () => {
    setShippingMethod.mockResolvedValue({
      ok: false,
      error: 'אופן משלוח לא מוכר',
      code: 'VALIDATION',
    })
    render(
      <CartProvider initialCart={physicalCart('supplier_delivery')}>
        <SidebarFromStore />
      </CartProvider>,
    )

    fireEvent.click(screen.getByRole('radio', { name: /איסוף עצמי מהספק/ }))

    await waitFor(() => expect(screen.getByRole('radio', { name: /משלוח עד הבית/ })).toBeChecked())
    expect(screen.getByRole('radio', { name: /איסוף עצמי מהספק/ })).not.toBeChecked()
  })

  it('does not fire a round trip for the option that is already chosen', () => {
    mount(physicalCart('supplier_delivery'))
    fireEvent.click(screen.getByRole('radio', { name: /משלוח עד הבית/ }))
    expect(setShippingMethod).not.toHaveBeenCalled()
  })
})
