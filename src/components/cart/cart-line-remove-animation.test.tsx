import { SAVED_FOR_LATER_KEY } from '@/lib/cart/saved-for-later'
import { type CartView, type CartViewItem, EMPTY_CART } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX16 (14.10.2026): A CART ROW LEAVES, IT DOES NOT VANISH.
 *
 * Measured before (logs/ux16/before.json, midRemove at all three widths): the
 * article was gone from the DOM within one frame of the remove press. Now the
 * press marks the row `data-leaving`, freezes its controls, and the store
 * write fires exactly once: on `animationend` of the exit, or on the fallback
 * timer when no stylesheet is there to animate (this renderer, for one).
 *
 * What has to hold: nothing reaches the server before the exit has ended;
 * the write fires once whichever signal comes first; a second press while
 * leaving is ignored; a REFUSED removal puts the row back under the shopper's
 * hands; and "save for later" leaves by the same door.
 */

const removeFromCart = vi.hoisted(() => vi.fn())
const updateCartItem = vi.hoisted(() => vi.fn())
vi.mock('@/server/actions/cart', () => ({
  addToCart: vi.fn(),
  updateCartItem: (...args: unknown[]) => updateCartItem(...args),
  removeFromCart: (...args: unknown[]) => removeFromCart(...args),
  clearCart: vi.fn(),
  removeUnavailableItems: vi.fn(),
  setShippingMethod: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import CartLineItem, {
  CART_LINE_LEAVE_FALLBACK_MS,
  ceilingHint,
  quantityAnnouncement,
} from './CartLineItem'
import { CartProvider } from './CartProvider'
import { SavedForLaterProvider } from './SavedForLaterProvider'

const LINE: CartViewItem = {
  product_id: '11111111-1111-4111-8111-111111111111',
  variant_id: null,
  quantity: 2,
  name_he: 'מקרר',
  slug: 'fridge',
  image_url: null,
  unit_price: agorot(250_000),
  line_total: agorot(500_000),
  type: 'physical',
  available: true,
  platform_fee: agorot(50_000),
  supplier_due: agorot(450_000),
  customer_pays_now: agorot(500_000),
  balance_due_at_business: agorot(0),
  cashback: agorot(0),
  platform_percent_bp: 1000,
  platform_percent_snapshot: 10,
  coupon_price_unit: null,
  max_quantity: 3,
  unavailable_reason: null,
}

function cartOf(items: CartViewItem[]): CartView {
  return {
    ...EMPTY_CART,
    id: 'cart-1',
    items,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: agorot(items.reduce((s, i) => s + i.line_total, 0)),
  }
}

function renderLine(item: CartViewItem = LINE, { saved = false } = {}) {
  const line = <CartLineItem item={item} />
  render(
    <CartProvider initialCart={cartOf([item])} isAuthenticated>
      {saved ? <SavedForLaterProvider>{line}</SavedForLaterProvider> : line}
    </CartProvider>,
  )
  return screen.getByRole('article') as HTMLElement
}

const removeButton = () => screen.getByRole('button', { name: `הסר ${LINE.name_he} מהעגלה` })

/**
 * jsdom has no AnimationEvent, so testing-library builds a plain Event and
 * drops the init's `animationName`; the component reads that name to tell the
 * exit from the price pulse, so it is defined on the event by hand.
 */
function animationEnd(target: Element, animationName: string) {
  const event = createEvent.animationEnd(target)
  Object.defineProperty(event, 'animationName', { value: animationName })
  fireEvent(target, event)
}

function endLeave(article: HTMLElement) {
  animationEnd(article, 'cart-line-leave')
}

beforeEach(() => {
  removeFromCart.mockReset()
  updateCartItem.mockReset()
  removeFromCart.mockResolvedValue({ ok: true, cart: cartOf([]) })
  updateCartItem.mockResolvedValue({ ok: true, cart: cartOf([LINE]) })
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the remove press', () => {
  it('marks the row as leaving and freezes its controls before anything is written', () => {
    const article = renderLine()
    expect(article).not.toHaveAttribute('data-leaving')

    fireEvent.click(removeButton())

    expect(article).toHaveAttribute('data-leaving', 'true')
    expect(article).toHaveAttribute('aria-busy', 'true')
    expect(removeFromCart).not.toHaveBeenCalled()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    expect(screen.getByRole('spinbutton')).toBeDisabled()
  })

  it('writes once when the exit animation ends', async () => {
    const article = renderLine()
    fireEvent.click(removeButton())

    await act(async () => {
      endLeave(article)
    })
    expect(removeFromCart).toHaveBeenCalledTimes(1)
    expect(removeFromCart).toHaveBeenCalledWith(LINE.product_id, null)

    // A second animationend (the browser fires one per animated property set
    // that ends with the name) must not write twice.
    await act(async () => {
      endLeave(article)
    })
    expect(removeFromCart).toHaveBeenCalledTimes(1)
  })

  it('ignores the end of a child animation (the price pulse) and other names', () => {
    const article = renderLine()
    fireEvent.click(removeButton())

    animationEnd(article, 'cart-total-pulse')
    const price = article.querySelector('.cart-line__price') as HTMLElement
    animationEnd(price, 'cart-line-leave')

    expect(removeFromCart).not.toHaveBeenCalled()
  })

  it('writes from the fallback timer when no animationend ever arrives', async () => {
    vi.useFakeTimers()
    renderLine()
    fireEvent.click(removeButton())
    expect(removeFromCart).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(CART_LINE_LEAVE_FALLBACK_MS - 1)
    })
    expect(removeFromCart).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(removeFromCart).toHaveBeenCalledTimes(1)
  })

  it('does not write twice when the animation ends after the timer already fired', async () => {
    vi.useFakeTimers()
    const article = renderLine()
    fireEvent.click(removeButton())
    await act(async () => {
      vi.advanceTimersByTime(CART_LINE_LEAVE_FALLBACK_MS)
    })
    await act(async () => {
      endLeave(article)
    })
    expect(removeFromCart).toHaveBeenCalledTimes(1)
  })

  it('ignores a second press while the row is leaving', () => {
    const article = renderLine()
    const button = removeButton()
    fireEvent.click(button)
    // The button is disabled, but a keyboard-queued second activation reaches
    // the handler regardless of the attribute in some engines; the guard is
    // in the handler, not the attribute.
    fireEvent.click(button)
    endLeave(article)
    expect(removeFromCart).toHaveBeenCalledTimes(1)
  })

  it('puts the row back under the shopper when the server refuses the removal', async () => {
    removeFromCart.mockResolvedValue({ ok: false, error: 'לא ניתן להסיר', code: 'refused' })
    const article = renderLine()
    fireEvent.click(removeButton())
    expect(article).toHaveAttribute('data-leaving', 'true')

    await act(async () => {
      endLeave(article)
    })
    // The store rolled the line back under the same key, so this very
    // component is still mounted and must be usable again.
    expect(article).not.toHaveAttribute('data-leaving')
    expect(removeButton()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'הוסף כמות' })).toBeEnabled()
  })
})

describe('save for later', () => {
  it('leaves by the same door: parked and written only once the exit has ended', async () => {
    const article = renderLine(LINE, { saved: true })
    fireEvent.click(screen.getByRole('button', { name: `שמור ${LINE.name_he} לאחר כך` }))

    expect(article).toHaveAttribute('data-leaving', 'true')
    expect(removeFromCart).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)

    await act(async () => {
      endLeave(article)
    })
    expect(removeFromCart).toHaveBeenCalledWith(LINE.product_id, null)
    const raw = JSON.parse(localStorage.getItem(SAVED_FOR_LATER_KEY) as string)
    expect(raw.state.items).toHaveLength(1)
    expect(raw.state.items[0]).toMatchObject({ product_id: LINE.product_id, quantity: 2 })
  })
})

describe('the quantity controls', () => {
  it('announce the new count in the live region after a step', async () => {
    renderLine()
    const output = screen.getByRole('status')
    expect(output).toHaveTextContent('')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'הוסף כמות' }))
    })
    expect(output).toHaveTextContent(quantityAnnouncement('מקרר', 3))
    expect(updateCartItem).toHaveBeenCalledWith(LINE.product_id, null, 3)
  })

  it('explain the grey plus once the shelf is reached, and name the hint on the button', async () => {
    renderLine()
    const plus = screen.getByRole('button', { name: 'הוסף כמות' })
    expect(plus).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText('זו הכמות המקסימלית במלאי')).toBeNull()

    await act(async () => {
      fireEvent.click(plus)
    })
    expect(plus).toBeDisabled()
    const hint = screen.getByText('זו הכמות המקסימלית במלאי')
    expect(plus).toHaveAttribute('aria-describedby', hint.id)
  })

  it('name the order cap, not the shelf, on a line the catalogue does not count', () => {
    renderLine({ ...LINE, quantity: 99, max_quantity: null })
    expect(screen.getByText('עד 99 יחידות בהזמנה אחת')).toBeInTheDocument()
  })

  it('show the unit price times the count on the card, and not at one', () => {
    renderLine()
    expect(screen.getByTestId('cart-line-meta')).toHaveTextContent('× 2')
  })

  it('show no meta line at a count of one', () => {
    renderLine({ ...LINE, quantity: 1, line_total: agorot(250_000) })
    expect(screen.queryByTestId('cart-line-meta')).toBeNull()
  })
})

describe('ceilingHint', () => {
  it('is silent under the ceiling', () => {
    expect(ceilingHint(2, 3, true)).toBeNull()
    expect(ceilingHint(1, 99, false)).toBeNull()
  })

  it('tells the shelf from the cap', () => {
    expect(ceilingHint(3, 3, true)).toBe('זו הכמות המקסימלית במלאי')
    expect(ceilingHint(99, 99, false)).toBe('עד 99 יחידות בהזמנה אחת')
  })
})
