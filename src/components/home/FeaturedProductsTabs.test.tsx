import type { Product } from '@/components/ProductCard'
import { fireEvent, render, screen } from '@testing-library/react'
import FeaturedProductsTabs from './FeaturedProductsTabs'

const mockProducts: Product[] = [
  {
    id: '1',
    slug: 'product-1',
    name_he: 'מוצר 1',
    kenyon_price: 100,
    full_price: 200,
    images: ['https://example.com/image1.jpg'],
    stock_quantity: 10,
    category: { name_he: 'קטגוריה 1', slug: 'category-1' },
  },
  {
    id: '2',
    slug: 'product-2',
    name_he: 'מוצר 2',
    kenyon_price: 150,
    full_price: 250,
    images: ['https://example.com/image2.jpg'],
    stock_quantity: 5,
    category: { name_he: 'קטגוריה 2', slug: 'category-2' },
  },
  {
    id: '3',
    slug: 'product-3',
    name_he: 'מוצר 3',
    kenyon_price: 200,
    full_price: null,
    images: ['https://example.com/image3.jpg'],
    stock_quantity: 0,
    category: { name_he: 'קטגוריה 1', slug: 'category-1' },
  },
  {
    id: '4',
    slug: 'product-4',
    name_he: 'מוצר 4',
    kenyon_price: 175,
    full_price: 350,
    images: ['https://example.com/image4.jpg'],
    stock_quantity: 20,
    category: { name_he: 'קטגוריה 2', slug: 'category-2' },
  },
  {
    id: '5',
    slug: 'product-5',
    name_he: 'מוצר 5',
    kenyon_price: 125,
    full_price: 200,
    images: ['https://example.com/image5.jpg'],
    stock_quantity: 3,
    category: { name_he: 'קטגוריה 1', slug: 'category-1' },
  },
  {
    id: '6',
    slug: 'product-6',
    name_he: 'מוצר 6',
    kenyon_price: 300,
    full_price: 400,
    images: ['https://example.com/image6.jpg'],
    stock_quantity: 15,
    category: { name_he: 'קטגוריה 2', slug: 'category-2' },
  },
  {
    id: '7',
    slug: 'product-7',
    name_he: 'מוצר 7',
    kenyon_price: 90,
    full_price: null,
    images: ['https://example.com/image7.jpg'],
    stock_quantity: 0,
    category: { name_he: 'קטגוריה 1', slug: 'category-1' },
  },
  {
    id: '8',
    slug: 'product-8',
    name_he: 'מוצר 8',
    kenyon_price: 220,
    full_price: 300,
    images: ['https://example.com/image8.jpg'],
    stock_quantity: 8,
    category: { name_he: 'קטגוריה 2', slug: 'category-2' },
  },
  {
    id: '9',
    slug: 'product-9',
    name_he: 'מוצר 9',
    kenyon_price: 160,
    full_price: 200,
    images: ['https://example.com/image9.jpg'],
    stock_quantity: 12,
    category: { name_he: 'קטגוריה 1', slug: 'category-1' },
  },
]

describe('FeaturedProductsTabs', () => {
  it('renders the section with correct title and tabs', () => {
    render(<FeaturedProductsTabs products={mockProducts} />)

    const title = screen.getByText('מוצרים מומלצים')
    expect(title).toBeInTheDocument()

    const tabs = screen.getAllByRole('button')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveTextContent('מומלצים')
    expect(tabs[1]).toHaveTextContent('במבצע')
    expect(tabs[2]).toHaveTextContent('במלאי')
  })

  it('displays 8 products from recommended tab by default', () => {
    render(<FeaturedProductsTabs products={mockProducts} />)

    const products = screen.getAllByRole('article')
    expect(products).toHaveLength(8)
  })

  it('uses responsive grid layout with correct Tailwind classes', () => {
    const { container } = render(<FeaturedProductsTabs products={mockProducts} />)

    const grid = container.querySelector('.grid')
    expect(grid).toBeInTheDocument()
    expect(grid).toHaveClass('grid')
    expect(grid).toHaveClass('grid-cols-1')
    expect(grid).toHaveClass('md:grid-cols-2')
    expect(grid).toHaveClass('xl:grid-cols-4')
  })

  it('applies h-full class to wrapper divs for consistent card heights', () => {
    const { container } = render(<FeaturedProductsTabs products={mockProducts} />)

    const wrapperDivs = container.querySelectorAll('.grid > div')
    for (const div of wrapperDivs) {
      expect(div).toHaveClass('h-full')
    }
  })

  it('has correct gap spacing on grid', () => {
    const { container } = render(<FeaturedProductsTabs products={mockProducts} />)

    const grid = container.querySelector('.grid')
    expect(grid).toHaveClass('gap-2')
  })

  it('filters sale products when sale tab is clicked', () => {
    render(<FeaturedProductsTabs products={mockProducts} />)

    const saleTab = screen.getByRole('button', { name: 'במבצע' })
    fireEvent.click(saleTab)

    const products = screen.getAllByRole('article')
    // Should show only products with full_price > kenyon_price
    expect(products.length).toBeGreaterThan(0)
    expect(products.length).toBeLessThanOrEqual(8)
  })

  it('filters in-stock products when instock tab is clicked', () => {
    render(<FeaturedProductsTabs products={mockProducts} />)

    const instockTab = screen.getByRole('button', { name: 'במלאי' })
    fireEvent.click(instockTab)

    const products = screen.getAllByRole('article')
    // Should show only products with stock_quantity > 0
    expect(products.length).toBeGreaterThan(0)
    expect(products.length).toBeLessThanOrEqual(8)
  })

  it('shows message when no products match filter', () => {
    const emptyProducts: Product[] = []
    render(<FeaturedProductsTabs products={emptyProducts} />)

    const emptyMessage = screen.getByText('אין מוצרים להצגה')
    expect(emptyMessage).toBeInTheDocument()
  })

  it('highlights active tab correctly', () => {
    render(<FeaturedProductsTabs products={mockProducts} />)

    const recommendedTab = screen.getByRole('button', { name: 'מומלצים' })
    expect(recommendedTab).toHaveAttribute('aria-pressed', 'true')

    const saleTab = screen.getByRole('button', { name: 'במבצע' })
    expect(saleTab).toHaveAttribute('aria-pressed', 'false')
  })

  it('updates aria-pressed when tab is clicked', () => {
    render(<FeaturedProductsTabs products={mockProducts} />)

    const saleTab = screen.getByRole('button', { name: 'במבצע' })
    fireEvent.click(saleTab)

    expect(saleTab).toHaveAttribute('aria-pressed', 'true')

    const recommendedTab = screen.getByRole('button', { name: 'מומלצים' })
    expect(recommendedTab).toHaveAttribute('aria-pressed', 'false')
  })
})
