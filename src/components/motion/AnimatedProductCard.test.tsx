import AnimatedProductCard from '@/components/motion/AnimatedProductCard'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

interface MockProductCardProps {
  product?: { name_he?: string }
}

vi.mock('@/components/ProductCard', () => ({
  default: (props: MockProductCardProps) => (
    <div data-testid="product-card">{props.product?.name_he}</div>
  ),
}))

const mockProduct = {
  id: '1',
  slug: 'test-product',
  name_he: 'מוצר בדיקה',
  kenyon_price: 9999,
  images: [],
  stock_quantity: 10,
  full_price: 14999,
}

describe('AnimatedProductCard', () => {
  it('renders product card', () => {
    const { getByTestId } = render(<AnimatedProductCard product={mockProduct} />)
    expect(getByTestId('product-card')).toBeInTheDocument()
  })

  it('applies motion wrapper with height class', () => {
    const { container } = render(<AnimatedProductCard product={mockProduct} />)
    const heightDiv = container.querySelector('.h-full')
    expect(heightDiv).toBeInTheDocument()
  })

  it('passes product to ProductCard', () => {
    const { container } = render(<AnimatedProductCard product={mockProduct} />)
    expect(container.innerHTML).toContain('מוצר בדיקה')
  })

  it('accepts className prop', () => {
    const { container } = render(
      <AnimatedProductCard product={mockProduct} className="custom-class" />,
    )
    expect(container.querySelector('.h-full')).toBeInTheDocument()
  })

  it('renders with different product', () => {
    const differentProduct = {
      ...mockProduct,
      id: '2',
      name_he: 'מוצר שונה',
      slug: 'different-product',
    }

    const { container } = render(<AnimatedProductCard product={differentProduct} />)
    expect(container.innerHTML).toContain('מוצר שונה')
  })
})
