import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import InfiniteDealsScroll from './InfiniteDealsScroll'

const mockProducts = Array.from({ length: 24 }, (_, i) => ({
  id: `product-${i}`,
  nameHe: `מוצר ${i}`,
  slug: `product-${i}`,
  images: [{ imageUrl: `/image-${i}.jpg` }],
  priceAgorot: 10000 + i * 100,
  saleAgorot: 8000 + i * 100,
  percentOff: 20,
  platformPercent: 10,
}))

describe('InfiniteDealsScroll', () => {
  it('renders initial products', () => {
    render(<InfiniteDealsScroll initialProducts={mockProducts.slice(0, 12)} />)
    expect(screen.getByLabelText('כל המוצרים')).toBeInTheDocument()
  })

  it('shows loading state when has more products', () => {
    render(<InfiniteDealsScroll initialProducts={mockProducts.slice(0, 12)} />)
    expect(screen.getByLabelText('טוען עוד מוצרים')).toBeInTheDocument()
  })

  it('shows completion message when no more products', () => {
    render(<InfiniteDealsScroll initialProducts={mockProducts} />)
    expect(screen.getByText('סיימנו להציג את כל המוצרים')).toBeInTheDocument()
  })
})
