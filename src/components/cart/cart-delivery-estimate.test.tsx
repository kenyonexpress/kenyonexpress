import { DELIVERY_CITY_KEY } from '@/components/cart/CartDeliveryEstimate'
import { CartProvider } from '@/components/cart/CartProvider'
import CartTotalsSidebar from '@/components/cart/CartTotalsSidebar'
import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two sidebar additions of STEP 09: the delivery estimate by city and
 * the cashback preview. What these hold:
 *
 *  - the city select appears for supplier delivery only, never for pickup
 *    and never for a coupon-only cart;
 *  - picking a city prints a band sentence and remembers the pick;
 *  - a remembered pick is read back on mount;
 *  - the cashback row shows the engine's figure and is hidden at zero.
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
    cashback: agorot(0),
    platform_percent_bp: 1000,
    platform_percent_snapshot: 10,
    coupon_price_unit: null,
    max_quantity: null,
    unavailable_reason: null,
    ...overrides,
  }
}

function physicalCart(
  method: 'supplier_delivery' | 'pickup' = 'supplier_delivery',
  extra: Partial<CartView> = {},
): CartView {
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
    ...extra,
  }
}

function mount(cart: CartView) {
  return render(
    <CartProvider initialCart={cart}>
      <CartTotalsSidebar cart={cart} />
    </CartProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('CartDeliveryEstimate', () => {
  it('offers a city select for supplier delivery and says nothing until one is picked', () => {
    mount(physicalCart())
    const select = screen.getByLabelText('זמן משלוח משוער לפי עיר')
    expect(select).toHaveValue('')
    expect(screen.queryByText(/^משלוח ל/)).toBeNull()
  })

  it('renders nothing for pickup', () => {
    mount(physicalCart('pickup'))
    expect(screen.queryByTestId('cart-delivery-estimate')).toBeNull()
  })

  it('renders nothing for a coupon-only cart, which ships nothing', () => {
    mount({
      ...EMPTY_CART,
      id: 'c',
      items: [line({ type: 'coupon' })],
      item_count: 1,
      shipping: null,
    })
    expect(screen.queryByTestId('cart-delivery-estimate')).toBeNull()
  })

  it('prints the band for the picked city, free, and remembers the pick', () => {
    mount(physicalCart())
    fireEvent.change(screen.getByLabelText('זמן משלוח משוער לפי עיר'), {
      target: { value: 'eilat' },
    })
    const out = screen.getByText(/משלוח לאילת/)
    expect(out).toHaveTextContent('5-7 ימי עסקים')
    expect(out).toHaveTextContent('ללא עלות')
    expect(localStorage.getItem(DELIVERY_CITY_KEY)).toBe('eilat')
  })

  it('reads a remembered city back on mount', () => {
    localStorage.setItem(DELIVERY_CITY_KEY, 'jerusalem')
    mount(physicalCart())
    expect(screen.getByLabelText('זמן משלוח משוער לפי עיר')).toHaveValue('jerusalem')
    expect(screen.getByText(/משלוח לירושלים/)).toHaveTextContent('3-5 ימי עסקים')
  })

  it('clearing the pick forgets it', () => {
    localStorage.setItem(DELIVERY_CITY_KEY, 'haifa')
    mount(physicalCart())
    fireEvent.change(screen.getByLabelText('זמן משלוח משוער לפי עיר'), {
      target: { value: '' },
    })
    expect(localStorage.getItem(DELIVERY_CITY_KEY)).toBeNull()
    expect(screen.queryByText(/^משלוח ל/)).toBeNull()
  })
})

describe('CartTotalsSidebar: cashback preview', () => {
  it('is hidden at zero, the ordinary state', () => {
    mount(physicalCart())
    expect(screen.queryByTestId('cart-cashback-row')).toBeNull()
  })

  it('shows the engine figure under the total when a line earns cashback', () => {
    mount(
      physicalCart('supplier_delivery', {
        items: [line({ cashback: agorot(500) })],
        cashback: agorot(500),
      }),
    )
    const row = screen.getByTestId('cart-cashback-row')
    expect(row).toHaveTextContent('קאשבק צפוי לארנק')
    expect(row).toHaveTextContent('5.00')
    expect(row).toHaveTextContent('יזוכה לאחר אספקה או מימוש')
  })
})
