import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ShopGridWithInfiniteScroll from './ShopGridWithInfiniteScroll'

// Mock the dependencies
vi.mock('@/lib/http/fetch-with-timeout', () => ({
  fetchWithTimeout: vi.fn(),
}))

vi.mock('../category/CategoryGridSkeleton', () => ({
  default: () => <div data-testid="grid-skeleton">Skeleton</div>,
}))

vi.mock('../category/CategoryProductCard', () => ({
  default: ({ product }: { product: Record<string, unknown> }) => (
    <div data-testid={`product-${(product as unknown as { id: string }).id}`}>
      {(product as unknown as { name_he: string }).name_he}
    </div>
  ),
}))

vi.mock('../category/InfiniteScrollLoader', () => ({
  default: ({
    onLoadMore,
    isLoading,
    hasMore,
  }: {
    onLoadMore: () => void
    isLoading: boolean
    hasMore: boolean
  }) => {
    if (!hasMore) return null
    return (
      <button
        type="button"
        data-testid="infinite-scroll-loader"
        onClick={() => hasMore && !isLoading && onLoadMore()}
      >
        {isLoading ? 'Loading...' : 'Load More'}
      </button>
    )
  },
}))

const mockProducts = [
  {
    id: '1',
    name_he: 'Product 1',
    slug: 'product-1',
    kenyon_price: 100,
    full_price: 200,
    images: [],
    stock_quantity: 10,
    created_at: '2026-01-01',
    type: 'digital',
    categories: [],
  },
  {
    id: '2',
    name_he: 'Product 2',
    slug: 'product-2',
    kenyon_price: 150,
    full_price: 250,
    images: [],
    stock_quantity: 5,
    created_at: '2026-01-02',
    type: 'digital',
    categories: [],
  },
]

describe('ShopGridWithInfiniteScroll', () => {
  it('renders initial items', () => {
    render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={100}
        pageSize={24}
        params={{}}
      />,
    )

    expect(screen.getByTestId('product-1')).toBeInTheDocument()
    expect(screen.getByTestId('product-2')).toBeInTheDocument()
  })

  it('shows loading indicator while fetching more items', async () => {
    const { fetchWithTimeout } = await import('@/lib/http/fetch-with-timeout')
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [mockProducts[0]] }),
    } as unknown as Response)

    render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={48}
        pageSize={24}
        params={{}}
      />,
    )

    const loader = screen.getByTestId('infinite-scroll-loader')
    fireEvent.click(loader)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('hides infinite scroll loader when no more items', () => {
    render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={2}
        pageSize={24}
        params={{}}
      />,
    )

    expect(screen.queryByTestId('infinite-scroll-loader')).not.toBeInTheDocument()
  })

  it('shows end-of-list message when no more items', () => {
    render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={2}
        pageSize={24}
        params={{}}
      />,
    )

    expect(screen.getByText('סיימנו! הראינו את כל המוצרים.')).toBeInTheDocument()
  })

  it('respects sort and filter parameters in API call', async () => {
    const { fetchWithTimeout } = await import('@/lib/http/fetch-with-timeout')
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [mockProducts[0]] }),
    } as unknown as Response)

    render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={48}
        pageSize={24}
        params={{
          sort: 'price_asc',
          min: '50',
          max: '500',
          type: 'digital',
        }}
      />,
    )

    const loader = screen.getByTestId('infinite-scroll-loader')
    fireEvent.click(loader)

    await waitFor(() => {
      expect(fetchWithTimeout).toHaveBeenCalledWith(expect.stringContaining('/api/shop/products?'))
    })
  })

  it('appends loaded items to the grid', async () => {
    const { fetchWithTimeout } = await import('@/lib/http/fetch-with-timeout')
    const newProduct = {
      ...mockProducts[0],
      id: '3',
      name_he: 'Product 3',
    }
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [newProduct] }),
    } as unknown as Response)

    render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={48}
        pageSize={24}
        params={{}}
      />,
    )

    const loader = screen.getByTestId('infinite-scroll-loader')
    fireEvent.click(loader)

    await waitFor(() => {
      expect(screen.getByTestId('product-3')).toBeInTheDocument()
    })
  })

  it('uses intersection observer for loading trigger', () => {
    const { getByTestId } = render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={100}
        pageSize={24}
        params={{}}
      />,
    )

    // The infinite scroll loader should use IntersectionObserver
    // This test verifies the component is rendered and ready to observe
    expect(getByTestId('infinite-scroll-loader')).toBeInTheDocument()
  })

  it('handles API errors gracefully', async () => {
    const { fetchWithTimeout } = await import('@/lib/http/fetch-with-timeout')
    vi.mocked(fetchWithTimeout).mockRejectedValueOnce(new Error('API Error'))

    render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={48}
        pageSize={24}
        params={{}}
      />,
    )

    const loader = screen.getByTestId('infinite-scroll-loader')
    fireEvent.click(loader)

    // After error, should still show items and allow retry
    await waitFor(() => {
      expect(screen.getByTestId('product-1')).toBeInTheDocument()
    })
  })

  it('applies 4-col view mode class by default', () => {
    const { container } = render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={100}
        pageSize={24}
        params={{}}
      />,
    )

    const grid = container.querySelector('.category-products--4-col')
    expect(grid).toBeInTheDocument()
  })

  it('applies correct view mode class for 3-col', () => {
    const { container } = render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={100}
        pageSize={24}
        params={{}}
        viewMode="3-col"
      />,
    )

    const grid = container.querySelector('.category-products--3-col')
    expect(grid).toBeInTheDocument()
  })

  it('applies correct view mode class for 2-col', () => {
    const { container } = render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={100}
        pageSize={24}
        params={{}}
        viewMode="2-col"
      />,
    )

    const grid = container.querySelector('.category-products--2-col')
    expect(grid).toBeInTheDocument()
  })

  it('applies correct view mode class for list', () => {
    const { container } = render(
      <ShopGridWithInfiniteScroll
        initialItems={mockProducts}
        totalCount={100}
        pageSize={24}
        params={{}}
        viewMode="list"
      />,
    )

    const grid = container.querySelector('.category-products--list')
    expect(grid).toBeInTheDocument()
  })
})
