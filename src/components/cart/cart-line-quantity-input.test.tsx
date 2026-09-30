import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The quantity on a cart line was a stepper and nothing else, one press per
 * unit. Twelve of something was eleven presses. It is a typed field now, and
 * what has to hold is the clamp: nothing the shopper types can reach the
 * server outside 1..ceiling, and typing 0 or nonsense reverts rather than
 * removing (the trash button beside it is the removal).
 */

const updateCartItem = vi.hoisted(() => vi.fn())
vi.mock('@/server/actions/cart', () => ({
  addToCart: vi.fn(),
  updateCartItem: (...args: unknown[]) => updateCartItem(...args),
  removeFromCart: vi.fn(),
  clearCart: vi.fn(),
  removeUnavailableItems: vi.fn(),
  setShippingMethod: vi.fn(),
}))

import CartLineItem, { commitTypedQuantity } from './CartLineItem'
import { CartProvider } from './CartProvider'

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
  max_quantity: 10,
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

function renderLine(item: CartViewItem = LINE) {
  render(
    <CartProvider initialCart={cartOf([item])} isAuthenticated>
      <CartLineItem item={item} />
    </CartProvider>,
  )
  return screen.getByRole('spinbutton', { name: `כמות עבור ${item.name_he}` }) as HTMLInputElement
}

beforeEach(() => {
  updateCartItem.mockReset()
  updateCartItem.mockResolvedValue({ ok: true, cart: cartOf([LINE]) })
  localStorage.clear()
})

describe('commitTypedQuantity', () => {
  it('writes a changed value inside the range', () => {
    expect(commitTypedQuantity('5', 3, 10)).toBe(5)
  })

  it('writes nothing for the same value, empty text or nonsense', () => {
    expect(commitTypedQuantity('3', 3, 10)).toBeNull()
    expect(commitTypedQuantity('', 3, 10)).toBeNull()
    expect(commitTypedQuantity('abc', 3, 10)).toBeNull()
  })

  it('clamps below to one, never to a removal', () => {
    expect(commitTypedQuantity('0', 3, 10)).toBe(1)
    expect(commitTypedQuantity('-4', 3, 10)).toBe(1)
  })

  it('clamps above to the ceiling', () => {
    expect(commitTypedQuantity('500', 3, 10)).toBe(10)
  })

  it('floors a fraction', () => {
    expect(commitTypedQuantity('4.9', 3, 10)).toBe(4)
  })
})

describe('the typed quantity field', () => {
  it('commits on blur with the typed value', () => {
    const input = renderLine()
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    expect(updateCartItem).toHaveBeenCalledWith(LINE.product_id, null, 5)
  })

  it('commits on Enter', () => {
    const input = renderLine()
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Enter blurs the field, and blur is the commit; jsdom does not blur on
    // its own, so the two are asserted in sequence.
    fireEvent.blur(input)
    expect(updateCartItem).toHaveBeenCalledTimes(1)
    expect(updateCartItem).toHaveBeenCalledWith(LINE.product_id, null, 7)
  })

  it('clamps to the line ceiling before anything reaches the server', () => {
    const input = renderLine()
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.blur(input)
    expect(updateCartItem).toHaveBeenCalledWith(LINE.product_id, null, 10)
    expect(input.value).toBe('10')
  })

  it('reverts on empty text and sends nothing', () => {
    const input = renderLine()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(updateCartItem).not.toHaveBeenCalled()
    expect(input.value).toBe('3')
  })

  it('treats zero as one, not as a removal', () => {
    const input = renderLine()
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.blur(input)
    expect(updateCartItem).toHaveBeenCalledWith(LINE.product_id, null, 1)
  })

  it('still has the stepper, and the two agree', async () => {
    const input = renderLine()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'הוסף כמות' }))
    })
    expect(updateCartItem).toHaveBeenCalledWith(LINE.product_id, null, 4)
    expect(input.value).toBe('4')
  })
})
