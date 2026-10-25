import type { CartView, CartViewItem } from '@/lib/cart/types'
import { agorot } from '@/lib/money'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CartLineItem from './CartLineItem'
import { CartProvider } from './CartProvider'

const mockItem: CartViewItem = {
  product_id: 'test-123',
  variant_id: 'var-456',
  quantity: 2,
  name_he: 'test product',
  image_url: '/test-image.jpg',
  slug: 'test-product',
  unit_price: agorot(5000),
  line_total: agorot(10000),
  available: true,
  customer_pays_now: agorot(10000),
  balance_due_at_business: agorot(0),
  platform_fee: agorot(2000),
  supplier_due: agorot(8000),
  type: 'physical',
  max_quantity: 10,
  platform_percent_bp: 2000,
  platform_percent_snapshot: 20,
  coupon_price_unit: null,
  unavailable_reason: null,
}

const mockCart: CartView = {
  id: 'test-cart',
  items: [],
  subtotal: agorot(0),
  total: agorot(0),
  item_count: 0,
  discount: agorot(0),
  balance_due_at_business: agorot(0),
  platform_fee: agorot(0),
  supplier_due: agorot(0),
  coupon: null,
  shipping: null,
}

function CartLineItemWrapper({ item }: { item: CartViewItem }) {
  return (
    <CartProvider initialCart={mockCart}>
      <CartLineItem item={item} />
    </CartProvider>
  )
}

describe('CartLineItem', () => {
  it('renders product name', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    expect(screen.getByText('test product')).toBeInTheDocument()
  })

  it('displays quantity in the quantity pill', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    const quantityValue = screen.getByText('2')
    expect(quantityValue).toHaveClass('cart-line__qty-value')
  })

  it('has remove button with aria label', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    const removeButton = screen.getByLabelText('הסר test product מהעגלה')
    expect(removeButton).toBeInTheDocument()
    expect(removeButton).toHaveClass('cart-line__remove')
  })

  it('has decrement and increment buttons', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    expect(screen.getByLabelText('הפחת כמות')).toBeInTheDocument()
    expect(screen.getByLabelText('הוסף כמות')).toBeInTheDocument()
  })

  it('decrement button is disabled at quantity 1', () => {
    const singleItem = { ...mockItem, quantity: 1 }
    render(<CartLineItemWrapper item={singleItem} />)
    const decrementBtn = screen.getByLabelText('הפחת כמות')
    expect(decrementBtn).toBeDisabled()
  })

  it('increment button is disabled at max quantity', () => {
    const maxItem = { ...mockItem, quantity: 10, max_quantity: 10 }
    render(<CartLineItemWrapper item={maxItem} />)
    const incrementBtn = screen.getByLabelText('הוסף כמות')
    expect(incrementBtn).toBeDisabled()
  })

  it('renders article with cart-line class', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    const article = screen.getByText('test product').closest('article')
    expect(article).toHaveClass('cart-line')
  })

  it('can toggle removal animation state', async () => {
    render(<CartLineItemWrapper item={mockItem} />)
    const article = screen.getByText('test product').closest('article')
    const removeButton = screen.getByLabelText('הסר test product מהעגלה')

    fireEvent.click(removeButton)
    await waitFor(() => {
      expect(article).toHaveClass('cart-line--removing')
    })
  })

  it('renders product image with correct alt text', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    const image = screen.getByAltText('test product')
    expect(image).toBeInTheDocument()
    expect(image).toHaveClass('h-full')
  })

  it('has product link that navigates to product page', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    const links = screen.getAllByRole('link')
    const productLink = links.find((link) => link.getAttribute('href') === '/product/test-product')
    expect(productLink).toBeInTheDocument()
  })

  it('renders with correct quantity control styling', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    const qtyContainer = screen.getByText('2').closest('.cart-line__qty')
    expect(qtyContainer).toHaveClass('cart-line__qty')
  })

  it('renders price information', () => {
    render(<CartLineItemWrapper item={mockItem} />)
    // Two labels carry it: the unit-price row below 768 and the aria-hidden
    // mobile label beside the line total, so a single-match query throws.
    expect(screen.getAllByText(/מחיר:/).length).toBeGreaterThan(0)
  })
})
