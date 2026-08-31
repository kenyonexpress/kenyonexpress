import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * THE DRAWER AND THE MINI-CART OFFERED A CHECKOUT THE CART PAGE REFUSED.
 *
 * `/cart` disables "המשך לתשלום" while any line is unavailable, explains which
 * ones, and offers to remove them. The drawer and the header dropdown mount the
 * SAME `CartCheckoutButton` and never passed `disabled` - the comment above the
 * drawer's copy even says "same gate as the cart page", meaning the auth gate,
 * which is the only half it had.
 *
 * That is the wrong surface to leave open. The drawer opens ON add-to-cart, so
 * it is the first cart most shoppers see and the one they check out from
 * without ever visiting /cart. And the drawer already PRINTS the warning per
 * line: it told the shopper the item had gone out of stock and offered them a
 * working checkout button in the same footer.
 *
 * What they hit instead was `beginCheckout` rebuilding the cart server-side and
 * refusing it through `validateCartView` - after the address, the phone and the
 * terms had been filled in. `CartCheckoutButton`'s own comment names that as
 * "the worst moment to learn that an item went out of stock", which is exactly
 * what the disabled state exists to prevent.
 *
 * The route out is already beside the button in both surfaces: "צפייה בעגלה
 * המלאה" leads to the page that names the lines and removes them in one press.
 */

vi.mock('@/lib/analytics/tracker', () => ({ track: vi.fn() }))
vi.mock('@/lib/analytics/commerce-client', () => ({ trackCommerce: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ refresh: vi.fn() }),
}))

import type { CartView, CartViewItem } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { useEffect } from 'react'
import CartDrawer from './CartDrawer'
import { CartProvider, useCartStoreApi } from './CartProvider'
import MiniCartDropdown from './MiniCartDropdown'

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

/** One in stock, two in the cart: the ordinary way a line goes bad. */
const SHORT_LINE = {
  ...LINE,
  available: false,
  max_quantity: 1,
  unavailable_reason: 'insufficient_stock',
} as unknown as CartViewItem

function cartOf(items: CartViewItem[]): CartView {
  return {
    id: 'cart-1',
    items,
    item_count: items.length,
    subtotal: agorot(500000),
    platform_fee: agorot(50000),
    supplier_due: agorot(450000),
    balance_due_at_business: agorot(0),
    coupon: null,
    discount: agorot(0),
    total: agorot(500000),
  } as unknown as CartView
}

/**
 * Neither surface renders anything until the store says it is open: the
 * dropdown shares `drawerOpen` with the sheet rather than holding a second
 * flag, so both are mounted the same way here.
 */
function OpenTheDrawer() {
  const store = useCartStoreApi()
  useEffect(() => {
    store.setState({ drawerOpen: true })
  }, [store])
  return null
}

function renderSurface(surface: 'drawer' | 'mini', items: CartViewItem[]) {
  return render(
    <CartProvider initialCart={cartOf(items)} isAuthenticated>
      <OpenTheDrawer />
      {surface === 'drawer' ? <CartDrawer /> : <MiniCartDropdown />}
    </CartProvider>,
  )
}

const checkoutLink = () => screen.getByRole('link', { name: 'המשך לתשלום' })

describe.each(['drawer', 'mini'] as const)('the %s checkout button', (surface) => {
  it('works on a cart that is fine', () => {
    renderSurface(surface, [LINE])
    const link = checkoutLink()
    expect(link.getAttribute('href')).toBe('/checkout')
    expect(link.getAttribute('aria-disabled')).not.toBe('true')
    // fireEvent.click returns false when something called preventDefault.
    expect(fireEvent.click(link)).toBe(true)
  })

  it('refuses while a line is unavailable, the same as /cart does', () => {
    renderSurface(surface, [SHORT_LINE])
    const link = checkoutLink()
    expect(link.getAttribute('aria-disabled')).toBe('true')
    // Enter on a focused link dispatches this same click, so one assertion
    // covers the keyboard route that `pointer-events: none` never blocked.
    expect(fireEvent.click(link)).toBe(false)
  })

  it('refuses on a mixed cart, not only an all-bad one', () => {
    renderSurface(surface, [LINE, { ...SHORT_LINE, product_id: 'other' } as CartViewItem])
    expect(checkoutLink().getAttribute('aria-disabled')).toBe('true')
  })

  it('leaves the way to fix it in reach', () => {
    // A refusal with no route out is the dead end this is not allowed to be.
    // Both surfaces link to /cart, which names the bad lines and removes them.
    renderSurface(surface, [SHORT_LINE])
    const toCart = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/cart')
    expect(toCart.length).toBeGreaterThan(0)
  })
})

describe('the drawer line itself', () => {
  it('says what is wrong, which is why the live button was a contradiction', () => {
    renderSurface('drawer', [SHORT_LINE])
    expect(screen.getByText('נותרו 1 במלאי — הפחיתו את הכמות כדי להמשיך')).toBeTruthy()
  })
})
