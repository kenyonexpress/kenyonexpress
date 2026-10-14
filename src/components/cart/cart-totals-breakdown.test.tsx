import { CartProvider } from '@/components/cart/CartProvider'
import CartTotalsSidebar, {
  cartGrandTotal,
  cartSavings,
  itemsNote,
} from '@/components/cart/CartTotalsSidebar'
import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * UX16 (14.10.2026): THE TOTALS BREAKDOWN.
 *
 * Measured before (logs/ux16/before.json, sidebar.rows): two rows, "פריטים
 * (1)" and the shipping line, then the total; no live region on the figure,
 * nothing said about VAT, nothing adding the discounts up, and a coupon's
 * in-store balance shown as a row with no figure for what the purchase costs
 * altogether.
 *
 * Pinned here: the note under the items row when products and units differ,
 * the savings sum (only when there are two or more discounts to add, and the
 * "חסכת" line under the total for any saving at all), the grand total with
 * the in-store balance folded in, the per-product disclosure, the VAT note,
 * and aria-live on the on-site figure. Every sum is `sumAgorot`.
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
  name_he: 'מקרר',
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

const SECOND: CartViewItem = {
  ...LINE,
  product_id: 'p2',
  slug: 'p2',
  name_he: 'מכונת כביסה',
  quantity: 3,
  unit_price: agorot(10_000),
  line_total: agorot(30_000),
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

function renderSidebar(view: CartView) {
  return render(
    <CartProvider initialCart={view}>
      <CartTotalsSidebar cart={view} />
    </CartProvider>,
  )
}

describe('the pure sums', () => {
  it('add the coupon and bundle discounts', () => {
    expect(cartSavings({ discount: agorot(1_000), bundle_discount: agorot(2_500) })).toBe(3_500)
    expect(cartSavings({ discount: agorot(0), bundle_discount: agorot(0) })).toBe(0)
  })

  it('fold the in-store balance into the grand total', () => {
    expect(cartGrandTotal({ total: agorot(10_000), balance_due_at_business: agorot(40_000) })).toBe(
      50_000,
    )
  })

  it('note products against units only when they differ', () => {
    expect(itemsNote(1, 1)).toBeNull()
    expect(itemsNote(2, 2)).toBeNull()
    expect(itemsNote(1, 4)).toBe('מוצר אחד, 4 יחידות')
    expect(itemsNote(2, 5)).toBe('2 מוצרים, 5 יחידות')
  })
})

describe('the ordinary cart', () => {
  it('shows the total as a polite live region, the VAT note, and nothing it cannot add up', () => {
    renderSidebar(cart({}))
    const total = screen.getByText(/300\.00/, { selector: 'strong' })
    expect(total).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('המחירים כוללים מע״מ')).toBeInTheDocument()
    expect(screen.queryByTestId('cart-savings-row')).toBeNull()
    expect(screen.queryByTestId('cart-saved-line')).toBeNull()
    expect(screen.queryByTestId('cart-grand-total')).toBeNull()
    expect(screen.queryByTestId('cart-breakdown')).toBeNull()
    expect(screen.getByText('פריטים (1)').querySelector('.cart-sidebar__row-note')).toBeNull()
  })

  it('pulses the total once when it changes and not on mount', async () => {
    vi.useFakeTimers()
    try {
      const view = cart({})
      const { rerender } = renderSidebar(view)
      const strong = () => screen.getByText(/₪/, { selector: 'strong' })
      expect(strong()).not.toHaveAttribute('data-pulse')

      const next = cart({ total: agorot(60_000), subtotal: agorot(60_000), item_count: 2 })
      rerender(
        <CartProvider initialCart={view}>
          <CartTotalsSidebar cart={next} />
        </CartProvider>,
      )
      expect(strong()).toHaveAttribute('data-pulse', 'true')
      await act(async () => {
        vi.advanceTimersByTime(600)
      })
      expect(strong()).not.toHaveAttribute('data-pulse')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('two products, four units', () => {
  const view = cart({
    items: [LINE, SECOND],
    item_count: 4,
    subtotal: agorot(60_000),
    total: agorot(60_000),
  })

  it('notes the two counts under the items row', () => {
    renderSidebar(view)
    expect(screen.getByText('2 מוצרים, 4 יחידות')).toHaveClass('cart-sidebar__row-note')
  })

  it('offers a closed per-product disclosure with each line as count × unit = total', () => {
    renderSidebar(view)
    const details = screen.getByTestId('cart-breakdown') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(screen.getByText('פירוט לפי מוצר')).toBeInTheDocument()
    const items = details.querySelectorAll('.cart-sidebar__breakdown-item')
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveTextContent('מכונת כביסה')
    expect(items[1]).toHaveTextContent('3 ×')
    expect(items[1]?.querySelector('.cart-sidebar__breakdown-sum')).toHaveTextContent('300.00')
  })
})

describe('discounts', () => {
  it('adds a savings row only when there are two discounts to add, and the saved line for one', () => {
    renderSidebar(
      cart({
        coupon: { code: 'WELCOME', label: 'ברוכים הבאים', discount: agorot(5_000) },
        discount: agorot(5_000),
        total: agorot(25_000),
      }),
    )
    expect(screen.queryByTestId('cart-savings-row')).toBeNull()
    expect(screen.getByTestId('cart-saved-line')).toHaveTextContent('חסכת')
    expect(screen.getByTestId('cart-saved-line')).toHaveTextContent('50.00')
  })

  it('sums a coupon and a bundle into one savings row', () => {
    renderSidebar(
      cart({
        coupon: { code: 'WELCOME', label: 'ברוכים הבאים', discount: agorot(5_000) },
        discount: agorot(5_000),
        bundles: [
          {
            id: 'b1',
            name_he: 'חבילת מטבח',
            times: 1,
            discount: agorot(2_500),
          } as CartView['bundles'][number],
        ],
        bundle_discount: agorot(2_500),
        total: agorot(22_500),
      }),
    )
    const row = screen.getByTestId('cart-savings-row')
    expect(row).toHaveTextContent('סך החיסכון')
    expect(row).toHaveTextContent('-')
    expect(row).toHaveTextContent('75.00')
    expect(screen.getByTestId('cart-saved-line')).toHaveTextContent('75.00')
  })
})

describe('a coupon line with a balance at the business', () => {
  it('shows what the purchase costs altogether, with the balance named', () => {
    renderSidebar(
      cart({
        items: [
          {
            ...LINE,
            type: 'coupon',
            customer_pays_now: agorot(10_000),
            balance_due_at_business: agorot(40_000),
            coupon_price_unit: agorot(10_000),
          },
        ],
        balance_due_at_business: agorot(40_000),
        total: agorot(10_000),
        shipping: null,
      }),
    )
    const grand = screen.getByTestId('cart-grand-total')
    expect(grand).toHaveTextContent('סה״כ עלות הרכישה')
    expect(grand.querySelector('strong')).toHaveTextContent('500.00')
    expect(grand).toHaveTextContent('כולל')
    expect(grand).toHaveTextContent('400.00')
    expect(grand).toHaveTextContent('לתשלום בחנות')
  })
})
