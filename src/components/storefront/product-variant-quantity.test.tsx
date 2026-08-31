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
