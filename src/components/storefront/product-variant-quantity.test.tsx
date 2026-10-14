import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE VARIANT PICKER IS THE ONE BUY-ROW PATH NO LIVE PRODUCT EXERCISES.
 *
 * MEASURED: `product_variants` is empty for all 61 active products, so every
 * probe of a real product page renders zero variant buttons. The whole branch --
 * auto-selection, the disabled sold-out variant, the block on "no variant
 * chosen", and the quantity ceiling that MOVES when the choice does -- is
 * unreachable from the storefront today and reachable the moment an admin adds
 * a size to a product. That is precisely the code that needs a test rather than
 * a page visit.
 *
 * THE BUG THIS PINS. The ceiling belongs to the selection: `max` is
 * `min(99, stock of the chosen variant)`. Choosing the 50-in-stock variant,
 * typing 20 and then switching to the 3-in-stock one left `20` in an input
 * whose `max` had just become 3, and add-to-cart sent 20 for the server to
 * refuse -- the same "offer a number the write rejects" defect that
 * `productQuantityCeiling` was introduced to end on the base product.
 */

const addToCart = vi.hoisted(() => vi.fn(async () => true))
const push = vi.hoisted(() => vi.fn())

vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({ addToCart, isPending: false }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
// The tag line now mounts the wishlist heart (a server action behind it) and
// the summary subscribes to its live topic; neither has a request scope or a
// socket here, and neither is what this file is about.
vi.mock('@/server/actions/reviews', () => ({
  getWishlistSaved: async () => false,
  toggleWishlist: async () => ({ ok: true, saved: true }),
}))
vi.mock('@/server/actions/stock-alerts', () => ({ joinStockWaitlist: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    throw new Error('no socket in this suite')
  },
}))

import ProductInfo from './ProductInfo'

const BASE = {
  productId: '11111111-1111-4111-8111-111111111111',
  name: 'תיק גב',
  nameEn: null,
  basePrice: 199,
  oldPrice: null,
  baseStock: 50,
  sku: null,
  categoryName: null,
  city: null,
  attributes: [],
  isCoupon: false,
  couponOffer: null,
}

const PLENTY = {
  id: 'v-plenty',
  name_he: 'שחור',
  price: null,
  price_modifier: 0,
  stock_quantity: 50,
  sku: null,
}
const SCARCE = { ...PLENTY, id: 'v-scarce', name_he: 'אדום', stock_quantity: 3 }
const SOLD_OUT = { ...PLENTY, id: 'v-sold', name_he: 'כחול', stock_quantity: 0 }

const qty = () => screen.getByLabelText('כמות') as HTMLInputElement
const variant = (label: string) => screen.getByRole('button', { name: label })

describe('the product page variant picker', () => {
  beforeEach(() => {
    addToCart.mockClear()
    addToCart.mockResolvedValue(true)
  })

  it('lowers the quantity when the shopper switches to a smaller shelf', () => {
    render(<ProductInfo {...BASE} variants={[PLENTY, SCARCE]} />)

    fireEvent.click(variant('שחור'))
    fireEvent.change(qty(), { target: { value: '20' } })
    expect(qty().value).toBe('20')
    expect(qty().max).toBe('50')

    fireEvent.click(variant('אדום'))
    expect(qty().max).toBe('3')
    // The number the shopper is left holding, not just the attribute above it.
    expect(qty().value).toBe('3')
  })

  it('sends the lowered quantity, which is the half that reaches the server', async () => {
    render(<ProductInfo {...BASE} variants={[PLENTY, SCARCE]} />)

    fireEvent.click(variant('שחור'))
    fireEvent.change(qty(), { target: { value: '20' } })
    fireEvent.click(variant('אדום'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /הוסף לסל/ }))
    })

    expect(addToCart).toHaveBeenCalledWith(BASE.productId, 'v-scarce', 3, BASE.name)
  })

  it('leaves a quantity the new choice can honour alone', () => {
    render(<ProductInfo {...BASE} variants={[PLENTY, SCARCE]} />)

    fireEvent.click(variant('אדום'))
    fireEvent.change(qty(), { target: { value: '2' } })
    fireEvent.click(variant('שחור'))
    expect(qty().value).toBe('2')
  })

  it('blocks the buy row until a variant is chosen', () => {
    render(<ProductInfo {...BASE} variants={[PLENTY, SCARCE]} />)

    expect(screen.getByRole('button', { name: /הוסף לסל/ })).toBeDisabled()
    fireEvent.click(variant('שחור'))
    expect(screen.getByRole('button', { name: /הוסף לסל/ })).not.toBeDisabled()
  })

  it('chooses the only variant there is', () => {
    render(<ProductInfo {...BASE} variants={[SCARCE]} />)

    expect(screen.getByRole('button', { name: /הוסף לסל/ })).not.toBeDisabled()
    // Selected means its shelf is the ceiling, not just that it looks pressed.
    expect(qty().max).toBe('3')
  })

  it('disables a sold-out variant and says so when it is the only one', () => {
    render(<ProductInfo {...BASE} variants={[PLENTY, SOLD_OUT]} />)
    expect(variant('כחול')).toBeDisabled()

    render(<ProductInfo {...BASE} variants={[SOLD_OUT]} />)
    // Auto-selected AND empty: the label has to be the honest one, and the
    // quantity input goes with it.
    expect(screen.getAllByRole('button', { name: /אזל מהמלאי/ }).length).toBeGreaterThan(0)
  })

  it('falls back to the product shelf for a variant that tracks no stock', () => {
    render(<ProductInfo {...BASE} variants={[{ ...PLENTY, stock_quantity: null }]} />)
    // Untracked is not empty. 50 is the product's own level.
    expect(qty().max).toBe('50')
    expect(screen.getByRole('button', { name: /הוסף לסל/ })).not.toBeDisabled()
  })
})

/**
 * UX15: the quantity box gained a minus and a plus, the field can be
 * emptied and retyped, and the variant row is a labelled group whose
 * buttons carry a pressed state and, where it differs, their own price.
 */
describe('the quantity stepper (UX15)', () => {
  const minus = () => screen.getByRole('button', { name: 'הפחת כמות' })
  const plus = () => screen.getByRole('button', { name: 'הוסף כמות' })

  it('steps within 1 and the ceiling, and disables at the ends', () => {
    render(<ProductInfo {...BASE} baseStock={3} variants={[]} />)
    expect(qty().value).toBe('1')
    expect(minus()).toBeDisabled()
    fireEvent.click(plus())
    fireEvent.click(plus())
    expect(qty().value).toBe('3')
    expect(plus()).toBeDisabled()
    expect(minus()).not.toBeDisabled()
    fireEvent.click(minus())
    expect(qty().value).toBe('2')
  })

  it('sends the stepped quantity to the cart', async () => {
    render(<ProductInfo {...BASE} variants={[]} />)
    fireEvent.click(plus())
    fireEvent.click(plus())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /הוסף לסל/ }))
    })
    expect(addToCart).toHaveBeenCalledWith(BASE.productId, null, 3, BASE.name)
  })

  it('lets the field be emptied and retyped, and never adds a blank', async () => {
    render(<ProductInfo {...BASE} variants={[]} />)
    fireEvent.change(qty(), { target: { value: '' } })
    expect(qty().value).toBe('')
    fireEvent.change(qty(), { target: { value: '4' } })
    expect(qty().value).toBe('4')
    fireEvent.change(qty(), { target: { value: '' } })
    fireEvent.blur(qty())
    // Back to the last number it held, not to nothing and not to 1.
    expect(qty().value).toBe('4')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /הוסף לסל/ }))
    })
    expect(addToCart).toHaveBeenCalledWith(BASE.productId, null, 4, BASE.name)
  })

  it('is one labelled group, and both buttons are off while sold out', () => {
    render(<ProductInfo {...BASE} baseStock={0} variants={[]} />)
    expect(screen.getByRole('group', { name: 'בחירת כמות' })).toBeInTheDocument()
    expect(minus()).toBeDisabled()
    expect(plus()).toBeDisabled()
    expect(qty()).toBeDisabled()
  })
})

describe('the variant group (UX15)', () => {
  it('is a labelled group whose label names the choice once made', () => {
    render(<ProductInfo {...BASE} variants={[PLENTY, SCARCE]} />)
    expect(screen.getByRole('group', { name: 'בחרו גרסה' })).toBeInTheDocument()
    expect(screen.getByTestId('pdp-variant-hint')).toHaveTextContent('בחרו גרסה כדי להוסיף לסל')
    expect(variant('שחור')).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(variant('אדום'))
    expect(screen.getByRole('group', { name: 'גרסה: אדום' })).toBeInTheDocument()
    expect(variant('אדום')).toHaveAttribute('aria-pressed', 'true')
    expect(variant('שחור')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('pdp-variant-hint')).toBeNull()
  })

  it('shows a variant its own price only when it differs from the one above', () => {
    render(
      <ProductInfo {...BASE} variants={[PLENTY, { ...SCARCE, price: null, price_modifier: 20 }]} />,
    )
    // Same price as the base: the name alone.
    expect(screen.getByRole('button', { name: 'שחור' })).toBeInTheDocument()
    // 199 + 20: the button says so, and so does the price line once chosen.
    const dearer = screen.getByRole('button', { name: /אדום/ })
    expect(dearer).toHaveTextContent(/219/)
    fireEvent.click(dearer)
    expect(document.querySelector('.pdp-summary__price')?.textContent).toContain('219')
  })

  it('keeps a sold-out variant in the row, disabled and described as such', () => {
    render(<ProductInfo {...BASE} variants={[PLENTY, SOLD_OUT]} />)
    const gone = variant('כחול')
    expect(gone).toBeDisabled()
    expect(gone).toHaveAttribute('data-sold-out', 'true')
    expect(gone).toHaveAttribute('aria-describedby', 'pdp-variant-soldout')
    expect(document.getElementById('pdp-variant-soldout')?.textContent).toBe('אזל מהמלאי')
  })
})
