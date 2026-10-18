import { render, screen } from '@testing-library/react'
import CategoryGridWithPagination from './CategoryGridWithPagination'
import type { CategoryProduct } from './CategoryProductCard'

vi.mock('./CategoryProductCard', () => ({
  default: ({ product }: { product: CategoryProduct }) => (
    <div data-testid={`product-card-${product.id}`}>{product.name_he}</div>
  ),
}))

vi.mock('./Pagination', () => ({
  default: ({
    currentPage,
    totalPages,
  }: {
    pathname?: string
    currentPage: number
    totalPages: number
  }) => (
    <nav data-testid="pagination">
      <div>
        Page {currentPage} of {totalPages}
      </div>
    </nav>
  ),
}))

const mockProducts: CategoryProduct[] = [
  {
    id: '1',
    slug: 'product-1',
    name_he: 'מוצר 1',
    kenyon_price: 1000,
    full_price: 2000,
    images: [],
    stock_quantity: 10,
    categories: [{ name_he: 'קטגוריה', slug: 'category' }],
  },
  {
    id: '2',
    slug: 'product-2',
    name_he: 'מוצר 2',
    kenyon_price: 1500,
    full_price: 3000,
    images: [],
    stock_quantity: 5,
    categories: [{ name_he: 'קטגוריה', slug: 'category' }],
  },
]

describe('CategoryGridWithPagination', () => {
  it('renders product cards for each item', () => {
    render(
      <CategoryGridWithPagination
        items={mockProducts}
        currentPage={1}
        totalPages={2}
        categorySlug="category"
        params={{}}
      />,
    )

    expect(screen.getByTestId('product-card-1')).toBeInTheDocument()
    expect(screen.getByTestId('product-card-2')).toBeInTheDocument()
  })

  it('renders pagination component', () => {
    render(
      <CategoryGridWithPagination
        items={mockProducts}
        currentPage={1}
        totalPages={2}
        categorySlug="category"
        params={{}}
      />,
    )

    expect(screen.getByTestId('pagination')).toBeInTheDocument()
  })

  it('applies correct CSS class for view mode', () => {
    const { container } = render(
      <CategoryGridWithPagination
        items={mockProducts}
        currentPage={1}
        totalPages={2}
        categorySlug="category"
        params={{}}
        viewMode="3-col"
      />,
    )

    const grid = container.querySelector('.category-products--3-col')
    expect(grid).toBeInTheDocument()
  })

  it('defaults to 4-col view mode when not specified', () => {
    const { container } = render(
      <CategoryGridWithPagination
        items={mockProducts}
        currentPage={1}
        totalPages={2}
        categorySlug="category"
        params={{}}
      />,
    )

    const grid = container.querySelector('.category-products--4-col')
    expect(grid).toBeInTheDocument()
  })

  it('renders empty list when no items provided', () => {
    const { container } = render(
      <CategoryGridWithPagination
        items={[]}
        currentPage={1}
        totalPages={1}
        categorySlug="category"
        params={{}}
      />,
    )

    const list = container.querySelector('ul')
    expect(list).toBeEmptyDOMElement()
  })

  it('passes pagination props correctly', () => {
    render(
      <CategoryGridWithPagination
        items={mockProducts}
        currentPage={2}
        totalPages={5}
        categorySlug="test-category"
        params={{ sort: 'price', min: '100' }}
      />,
    )

    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument()
  })

  it('renders list items with correct structure', () => {
    const { container } = render(
      <CategoryGridWithPagination
        items={mockProducts}
        currentPage={1}
        totalPages={1}
        categorySlug="category"
        params={{}}
      />,
    )

    const items = container.querySelectorAll('.category-products__item')
    expect(items).toHaveLength(2)
  })
})
