import CartLineItem from '@/components/cart/CartLineItem'
import { CartProvider } from '@/components/cart/CartProvider'
import SavedForLaterList from '@/components/cart/SavedForLaterList'
import { SavedForLaterProvider } from '@/components/cart/SavedForLaterProvider'
import { SAVED_FOR_LATER_KEY, type SavedItem } from '@/lib/cart/saved-for-later'
import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Save for later, end to end in the DOM. What these hold:
 *
 *  - the save button exists only inside the provider (the cart page), so
 *    the drawer and mini cart are untouched;
 *  - pressing it parks the line in localStorage and removes it from the
 *    cart through the real remove action;
 *  - the list reads parked rows back after hydration;
 *  - "return to cart" goes through addToCart and drops the row ONLY when the
 *    server took the item; a refused add keeps it parked.
 */

const removeFromCart = vi.fn()
const addToCart = vi.fn()

vi.mock('@/server/actions/cart', () => ({
  addToCart: (...args: unknown[]) => addToCart(...args),
  updateCartItem: vi.fn(),
  removeFromCart: (...args: unknown[]) => removeFromCart(...args),
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
    quantity: 3,
    name_he: 'כיסא',
    slug: 'kise',
    image_url: null,
    unit_price: agorot(12_000),
    line_total: agorot(36_000),
    type: 'physical',
    available: true,
    platform_fee: agorot(3_600),
    supplier_due: agorot(32_400),
    customer_pays_now: agorot(36_000),
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

function cartWith(items: CartViewItem[]): CartView {
  return {
    ...EMPTY_CART,
    id: 'cart-1',
    items,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: agorot(items.reduce((sum, item) => sum + item.line_total, 0)),
    total: agorot(items.reduce((sum, item) => sum + item.line_total, 0)),
  }
}

function parked(overrides: Partial<SavedItem> = {}): SavedItem {
  return {
    product_id: 'p9',
    variant_id: null,
    quantity: 2,
    name_he: 'שולחן',
    slug: 'shulchan',
    image_url: null,
    unit_price: agorot(50_000),
    saved_at: 1,
    ...overrides,
  }
}

function seed(items: SavedItem[]) {
  localStorage.setItem(SAVED_FOR_LATER_KEY, JSON.stringify({ state: { items }, version: 0 }))
}

function mountPage(cart: CartView) {
  return render(
    <CartProvider initialCart={cart}>
      <SavedForLaterProvider>
        {cart.items.map((item) => (
          <CartLineItem key={item.product_id} item={item} />
        ))}
        <SavedForLaterList />
      </SavedForLaterProvider>
    </CartProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  removeFromCart.mockResolvedValue({ ok: true, cart: EMPTY_CART })
})

describe('save for later', () => {
  it('has no save button outside the provider', () => {
    render(
      <CartProvider initialCart={cartWith([line()])}>
        <CartLineItem item={line()} />
      </CartProvider>,
    )
    expect(screen.queryByRole('button', { name: /שמור/ })).toBeNull()
  })

  it('parks the line and removes it from the cart', async () => {
    mountPage(cartWith([line()]))
    fireEvent.click(screen.getByRole('button', { name: 'שמור כיסא לאחר כך' }))

    await waitFor(() => expect(removeFromCart).toHaveBeenCalledWith('p1', null))
    const list = await screen.findByTestId('cart-saved')
    expect(list).toHaveTextContent('נשמר לאחר כך (1)')
    expect(list).toHaveTextContent('כיסא')
    expect(list).toHaveTextContent('3 ×')

    const raw = JSON.parse(localStorage.getItem(SAVED_FOR_LATER_KEY) as string)
    expect(raw.state.items).toHaveLength(1)
    expect(raw.state.items[0]).toMatchObject({ product_id: 'p1', quantity: 3, unit_price: 12_000 })
  })

  it('reads parked rows back after hydration, even on an empty cart', async () => {
    seed([parked()])
    mountPage(EMPTY_CART)
    expect(await screen.findByTestId('cart-saved')).toHaveTextContent('שולחן')
  })

  it('renders nothing when the list is empty', async () => {
    mountPage(EMPTY_CART)
    await act(async () => {})
    expect(screen.queryByTestId('cart-saved')).toBeNull()
  })

  it('returns a row to the cart through addToCart and drops it when the server took it', async () => {
    seed([parked()])
    addToCart.mockResolvedValue({ ok: true, cart: cartWith([line({ product_id: 'p9' })]) })
    mountPage(EMPTY_CART)
    fireEvent.click(await screen.findByRole('button', { name: 'החזר לעגלה' }))

    await waitFor(() => expect(addToCart).toHaveBeenCalledWith('p9', null, 2))
    await waitFor(() => expect(screen.queryByTestId('cart-saved')).toBeNull())
    expect(JSON.parse(localStorage.getItem(SAVED_FOR_LATER_KEY) as string).state.items).toEqual([])
  })

  it('keeps the row parked when the server refuses the add', async () => {
    seed([parked()])
    addToCart.mockResolvedValue({ ok: false, error: 'המוצר אינו זמין', code: 'UNAVAILABLE' })
    mountPage(EMPTY_CART)
    fireEvent.click(await screen.findByRole('button', { name: 'החזר לעגלה' }))

    await waitFor(() => expect(addToCart).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByTestId('cart-saved')).toHaveTextContent('שולחן')
  })

  it('discards a row without touching the cart', async () => {
    seed([parked()])
    mountPage(EMPTY_CART)
    fireEvent.click(await screen.findByRole('button', { name: 'הסר שולחן מהרשימה' }))
    await waitFor(() => expect(screen.queryByTestId('cart-saved')).toBeNull())
    expect(addToCart).not.toHaveBeenCalled()
    expect(removeFromCart).not.toHaveBeenCalled()
  })
})
