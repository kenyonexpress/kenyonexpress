import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductGrid, { type LoadMoreResult } from './ProductGrid'

vi.mock('@/components/category/CategoryProductCard', () => ({
  default: ({ product }: { product: { id: string; name_he: string } }) => (
    <article data-testid="product-card">{product.name_he}</article>
  ),
}))

type Observer = {
  callback: IntersectionObserverCallback
}

const observers: Observer[] = []

function product(id: string) {
  return {
    id,
    slug: id,
    name_he: `מוצר ${id}`,
    kenyon_price: 10,
    full_price: null,
    images: [],
    stock_quantity: 1,
    categories: [],
  }
}

function intersect() {
  const observer = observers.at(-1)
  if (!observer) throw new Error('no intersection observer')
  act(() => {
    observer.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    )
  })
}

beforeEach(() => {
  observers.length = 0
  class IO {
    constructor(callback: IntersectionObserverCallback) {
      observers.push({ callback })
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', IO)
})

describe('ProductGrid', () => {
  it('renders the first page and does not ask for more when the catalogue fits', () => {
    const onLoadMore = vi.fn()
    render(
      <ProductGrid
        initialProducts={[product('a')]}
        hasMore={false}
        onLoadMore={onLoadMore}
        totalCount={1}
      />,
    )
    expect(screen.getByText('מוצר a')).toBeInTheDocument()
    expect(observers).toHaveLength(0)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('loads the next page when the sentinel enters the viewport and shows six skeletons', async () => {
    let resolve: (value: LoadMoreResult) => void = () => {}
    const pending = new Promise<LoadMoreResult>((res) => {
      resolve = res
    })
    const onLoadMore = vi.fn(() => pending)

    render(
      <ProductGrid
        initialProducts={[product('a')]}
        hasMore
        onLoadMore={onLoadMore}
        totalCount={45}
        page={1}
      />,
    )

    intersect()
    intersect()

    expect(onLoadMore).toHaveBeenCalledTimes(1)
    expect(onLoadMore).toHaveBeenCalledWith(2)
    expect(
      screen.getByLabelText('טוען מוצרים').querySelectorAll('.category-products__item'),
    ).toHaveLength(6)
    expect(screen.getByRole('list', { name: 'טוען מוצרים' })).toHaveClass(
      'category-products--unclipped',
    )

    await act(async () => {
      resolve({
        products: [product('b'), product('c')],
        total_count: 45,
        has_more: true,
      })
      await pending
    })

    expect(screen.getByText('מוצר b')).toBeInTheDocument()
    expect(screen.getByText('מוצר c')).toBeInTheDocument()
    expect(screen.queryByLabelText('טוען מוצרים')).not.toBeInTheDocument()
    expect(document.querySelector('[data-page="2"]')).not.toBeNull()
    expect(document.querySelector('[data-total-count="45"]')).not.toBeNull()
    expect(document.querySelector('[data-loading="false"]')).not.toBeNull()
  })

  it('does not ask for the same page twice when the sentinel fires again before commit', async () => {
    const onLoadMore = vi.fn(async (next: number) => ({
      products: [product(`p${next}`)],
      total_count: 80,
      has_more: true,
    }))

    render(
      <ProductGrid
        initialProducts={[product('a')]}
        hasMore
        onLoadMore={onLoadMore}
        totalCount={80}
      />,
    )

    const observer = observers.at(-1)
    if (!observer) throw new Error('no intersection observer')
    await act(async () => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      )
      await Promise.resolve()
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      )
      await Promise.resolve()
    })

    expect(onLoadMore).toHaveBeenCalledTimes(1)
    expect(onLoadMore).toHaveBeenCalledWith(2)
    expect(screen.getByText('מוצר p2')).toBeInTheDocument()
  })

  it('offers a retry when the next page fails, and does not loop the observer', async () => {
    const onLoadMore = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        products: [product('b')],
        total_count: 40,
        has_more: false,
      })

    render(
      <ProductGrid
        initialProducts={[product('a')]}
        hasMore
        onLoadMore={onLoadMore}
        totalCount={40}
      />,
    )

    await act(async () => {
      intersect()
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'נסו שוב' })).toBeInTheDocument()
    const callsAfterFailure = onLoadMore.mock.calls.length

    await act(async () => {
      screen.getByRole('button', { name: 'נסו שוב' }).click()
      await Promise.resolve()
    })

    expect(onLoadMore.mock.calls.length).toBe(callsAfterFailure + 1)
    expect(screen.getByText('מוצר b')).toBeInTheDocument()
  })
})
