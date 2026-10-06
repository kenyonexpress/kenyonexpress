import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CategoryProduct } from './CategoryProductCard'
import ProductGrid from './ProductGrid'

vi.mock('./CategoryProductCard', () => ({
  default: ({ product }: { product: CategoryProduct }) => <span>{product.name_he}</span>,
}))

vi.mock('./CategoryGridSkeleton', () => ({
  default: ({ count }: { count: number }) => <div data-testid="skeleton">{count}</div>,
}))

const observe = vi.fn()
const disconnect = vi.fn()
class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    FakeObserver.cb = cb
  }
  observe = observe
  disconnect = disconnect
  unobserve = vi.fn()
  static cb: IntersectionObserverCallback | null = null
}

vi.stubGlobal('IntersectionObserver', FakeObserver)

const sample: CategoryProduct[] = [
  { id: '1', slug: 'a', name_he: 'א', kenyon_price: 10, images: [] },
  { id: '2', slug: 'b', name_he: 'ב', kenyon_price: 20, images: [] },
]

describe('ProductGrid', () => {
  it('renders the initial products', () => {
    render(<ProductGrid initialProducts={sample} hasMore={false} onLoadMore={() => {}} />)
    expect(screen.getByText('א')).toBeInTheDocument()
    expect(screen.getByText('ב')).toBeInTheDocument()
  })

  it('shows six skeleton cards while fetching', () => {
    render(
      <ProductGrid
        initialProducts={sample}
        hasMore={true}
        isLoading={true}
        onLoadMore={() => {}}
      />,
    )
    expect(screen.getByTestId('skeleton')).toHaveTextContent('6')
    expect(screen.queryByTestId('load-more-sentinel')).not.toBeInTheDocument()
  })

  it('observes the sentinel and calls onLoadMore when it intersects', () => {
    const onLoadMore = vi.fn()
    render(<ProductGrid initialProducts={sample} hasMore={true} onLoadMore={onLoadMore} />)
    expect(screen.getByTestId('load-more-sentinel')).toBeInTheDocument()
    expect(observe).toHaveBeenCalled()
    const entry = { isIntersecting: true } as IntersectionObserverEntry
    FakeObserver.cb?.([entry], {} as IntersectionObserver)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})
