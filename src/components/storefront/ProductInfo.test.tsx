import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProductInfo from './ProductInfo'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => '/product/test',
}))

vi.mock('@/components/cart/CartProvider', () => ({
  useCart: () => ({
    addToCart: vi.fn(async () => true),
    isPending: false,
  }),
}))

vi.mock('@/lib/geo/cities', () => ({
  cityByName: vi.fn(() => null),
}))

vi.mock('@/lib/share/message', () => ({
  buildShareMessage: vi.fn(() => 'Test message'),
}))

describe('ProductInfo - Variant Selector & Quantity Input', () => {
  const defaultProps = {
    productId: 'test-id',
    name: 'Test Product',
    nameEn: 'Test Product EN',
    basePrice: 100,
    oldPrice: null,
    baseStock: 10,
    sku: 'SKU123',
    categoryName: 'Test Category',
    city: null,
    attributes: [{ label: 'Color', value: 'Red' }],
    variants: [],
    isCoupon: false,
    couponOffer: null,
  }

  it('renders product name', () => {
    render(<ProductInfo {...defaultProps} />)
    expect(screen.getByText('Test Product')).toBeInTheDocument()
  })

  it('renders quantity input field with label', () => {
    render(<ProductInfo {...defaultProps} />)
    const quantityInput = screen.getByLabelText('כמות')
    expect(quantityInput).toBeInTheDocument()
  })

  it('quantity input has default value of 1', () => {
    render(<ProductInfo {...defaultProps} />)
    const quantityInput = screen.getByLabelText('כמות') as HTMLInputElement
    expect(quantityInput.value).toBe('1')
  })

  it('allows quantity input to be changed', () => {
    render(<ProductInfo {...defaultProps} baseStock={50} />)
    const quantityInput = screen.getByLabelText('כמות') as HTMLInputElement

    fireEvent.change(quantityInput, { target: { value: '5' } })
    expect(quantityInput.value).toBe('5')
  })

  it('enforces maximum quantity from stock ceiling', () => {
    render(<ProductInfo {...defaultProps} baseStock={10} />)
    const quantityInput = screen.getByLabelText('כמות') as HTMLInputElement

    fireEvent.change(quantityInput, { target: { value: '100' } })
    expect(quantityInput.value).toBe('10')
  })

  it('disables quantity input when out of stock', () => {
    render(<ProductInfo {...defaultProps} baseStock={0} />)
    const quantityInput = screen.getByLabelText('כמות')
    expect(quantityInput).toBeDisabled()
  })

  it('renders variant selector when variants exist', () => {
    const variantsProps = {
      ...defaultProps,
      variants: [
        { id: 'v1', name_he: 'Red', price: null, price_modifier: 0, stock_quantity: 10, sku: null },
        { id: 'v2', name_he: 'Blue', price: null, price_modifier: 0, stock_quantity: 5, sku: null },
      ],
    }
    render(<ProductInfo {...variantsProps} />)
    expect(screen.getByText('בחר גרסה')).toBeInTheDocument()
  })

  it('renders all variant option buttons', () => {
    const variantsProps = {
      ...defaultProps,
      variants: [
        { id: 'v1', name_he: 'Red', price: null, price_modifier: 0, stock_quantity: 10, sku: null },
        { id: 'v2', name_he: 'Blue', price: null, price_modifier: 5, stock_quantity: 5, sku: null },
        {
          id: 'v3',
          name_he: 'Green',
          price: null,
          price_modifier: 0,
          stock_quantity: 0,
          sku: null,
        },
      ],
    }
    render(<ProductInfo {...variantsProps} />)
    expect(screen.getByRole('button', { name: 'Red' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Green' })).toBeInTheDocument()
  })

  it('disables out-of-stock variant buttons', () => {
    const variantsProps = {
      ...defaultProps,
      variants: [
        { id: 'v1', name_he: 'Red', price: null, price_modifier: 0, stock_quantity: 10, sku: null },
        {
          id: 'v2',
          name_he: 'Green',
          price: null,
          price_modifier: 0,
          stock_quantity: 0,
          sku: null,
        },
      ],
    }
    render(<ProductInfo {...variantsProps} />)
    const greenButton = screen.getByRole('button', { name: 'Green' })
    expect(greenButton).toBeDisabled()
  })

  it('auto-selects single variant on render', () => {
    const singleVariant = {
      ...defaultProps,
      variants: [
        { id: 'v1', name_he: 'Red', price: null, price_modifier: 0, stock_quantity: 10, sku: null },
      ],
    }
    render(<ProductInfo {...singleVariant} />)
    const button = screen.getByRole('button', { name: 'Red' })
    expect(button).toHaveClass('bg-brand-dark')
  })

  it('allows variant selection by clicking button', () => {
    const variantsProps = {
      ...defaultProps,
      variants: [
        { id: 'v1', name_he: 'Red', price: null, price_modifier: 0, stock_quantity: 10, sku: null },
        { id: 'v2', name_he: 'Blue', price: null, price_modifier: 0, stock_quantity: 5, sku: null },
      ],
    }
    render(<ProductInfo {...variantsProps} />)
    const blueButton = screen.getByRole('button', { name: 'Blue' })

    fireEvent.click(blueButton)
    expect(blueButton).toHaveClass('bg-brand-dark')
  })

  it('adjusts quantity ceiling when variant stock changes', () => {
    const variantsProps = {
      ...defaultProps,
      variants: [
        { id: 'v1', name_he: 'Red', price: null, price_modifier: 0, stock_quantity: 10, sku: null },
        { id: 'v2', name_he: 'Blue', price: null, price_modifier: 0, stock_quantity: 5, sku: null },
      ],
    }
    render(<ProductInfo {...variantsProps} />)
    const quantityInput = screen.getByLabelText('כמות') as HTMLInputElement

    fireEvent.change(quantityInput, { target: { value: '8' } })
    expect(quantityInput.value).toBe('8')

    const blueButton = screen.getByRole('button', { name: 'Blue' })
    fireEvent.click(blueButton)

    expect(quantityInput.value).toBe('5')
  })

  it('renders add to cart button', () => {
    render(<ProductInfo {...defaultProps} />)
    const button = screen.getByRole('button', { name: /הוסף לסל/ })
    expect(button).toBeInTheDocument()
  })

  it('shows in-stock status when available', () => {
    render(<ProductInfo {...defaultProps} baseStock={10} />)
    expect(screen.getByText(/במלאי/)).toBeInTheDocument()
  })

  it('shows out-of-stock status when stock is zero', () => {
    render(<ProductInfo {...defaultProps} baseStock={0} isCoupon={false} />)
    const quantityInput = screen.getByLabelText('כמות')
    expect(quantityInput).toBeDisabled()
  })

  it('shows success message after adding to cart', async () => {
    render(<ProductInfo {...defaultProps} />)
    const button = screen.getByRole('button', { name: /הוסף לסל/ })

    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText(/נוסף לסל/)).toBeInTheDocument()
    })
  })
})
