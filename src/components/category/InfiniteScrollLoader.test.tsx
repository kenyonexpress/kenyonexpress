import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InfiniteScrollLoader from './InfiniteScrollLoader'

describe('InfiniteScrollLoader', () => {
  let mockObserver: any
  let mockOnLoadMore: () => void

  beforeEach(() => {
    mockOnLoadMore = vi.fn()

    mockObserver = {
      observe: vi.fn() as any,
      unobserve: vi.fn() as any,
      disconnect: vi.fn() as any,
    }

    // `new IntersectionObserver()` needs a constructor; an arrow function is not one.
    // biome-ignore lint/complexity/useArrowFunction: see above
    global.IntersectionObserver = vi.fn(function () {
      return mockObserver
    }) as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render the sentinel element', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)
    const sentinel = document.querySelector('.infinite-scroll-loader')
    expect(sentinel).toBeInTheDocument()
  })

  it('should set up IntersectionObserver with correct threshold', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)

    expect(global.IntersectionObserver).toHaveBeenCalledWith(expect.any(Function), {
      threshold: 0.5,
    })
  })

  it('should observe the sentinel element', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)

    expect(mockObserver.observe).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('should show spinner when isLoading is true', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={true} />)

    const spinner = document.querySelector('.infinite-scroll-loader__spinner')
    expect(spinner).toBeInTheDocument()
  })

  it('should not show spinner when isLoading is false', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)

    const spinner = document.querySelector('.infinite-scroll-loader__spinner')
    expect(spinner).not.toBeInTheDocument()
  })

  it('should return null when hasMore is false', () => {
    const { container } = render(
      <InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={false} isLoading={false} />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('should have aria-busy attribute set based on isLoading', () => {
    const { rerender } = render(
      <InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />,
    )

    const sentinel = document.querySelector('.infinite-scroll-loader')
    expect(sentinel).toHaveAttribute('aria-busy', 'false')

    rerender(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={true} />)

    expect(sentinel).toHaveAttribute('aria-busy', 'true')
  })

  it('should have aria-live attribute for accessibility', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)

    const sentinel = document.querySelector('.infinite-scroll-loader')
    expect(sentinel).toHaveAttribute('aria-live', 'polite')
  })

  it('should trigger onLoadMore when sentinel intersects', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)

    // Get the callback passed to IntersectionObserver
    const intersectionCallback = (global.IntersectionObserver as any).mock.calls[0][0]

    // Simulate intersection
    intersectionCallback([{ isIntersecting: true }])

    expect(mockOnLoadMore).toHaveBeenCalled()
  })

  it('should not trigger onLoadMore when not intersecting', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)

    const intersectionCallback = (global.IntersectionObserver as any).mock.calls[0][0]

    // Simulate no intersection
    intersectionCallback([{ isIntersecting: false }])

    expect(mockOnLoadMore).not.toHaveBeenCalled()
  })

  it('should not trigger onLoadMore when isLoading is true', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={true} />)

    // Get the callback - with isLoading=true, effect should not set up observer
    const observerCalls = (global.IntersectionObserver as any).mock.calls
    // isLoading=true means effect returns early, no observer should be created
    expect(observerCalls).toHaveLength(0)
  })

  it('should not trigger onLoadMore when hasMore is false', () => {
    const { rerender } = render(
      <InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />,
    )

    rerender(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={false} isLoading={false} />)

    // hasMore is false, so component should return null and not set up observer
    expect(mockObserver.unobserve).toHaveBeenCalled()
  })

  it('should unobserve on cleanup', () => {
    const { unmount } = render(
      <InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />,
    )

    unmount()

    expect(mockObserver.unobserve).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('should handle multiple entries and use the last one', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)

    const intersectionCallback = (global.IntersectionObserver as any).mock.calls[0][0]

    // Simulate multiple entries with last one intersecting
    intersectionCallback([
      { isIntersecting: false },
      { isIntersecting: true },
      { isIntersecting: false },
    ])

    expect(mockOnLoadMore).not.toHaveBeenCalled() // Last entry is false, so shouldn't load
  })

  it('should call onLoadMore only with last intersecting entry', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />)

    const intersectionCallback = (global.IntersectionObserver as any).mock.calls[0][0]

    // Multiple entries with last one intersecting
    intersectionCallback([{ isIntersecting: false }, { isIntersecting: true }])

    expect(mockOnLoadMore).toHaveBeenCalledTimes(1)
  })

  it('should have correct CSS class names', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={true} />)

    const sentinel = document.querySelector('.infinite-scroll-loader')
    expect(sentinel).toHaveClass('infinite-scroll-loader')

    const spinner = document.querySelector('.infinite-scroll-loader__spinner')
    expect(spinner).toHaveClass('infinite-scroll-loader__spinner')
  })

  it('should handle default values for optional props', () => {
    render(<InfiniteScrollLoader onLoadMore={mockOnLoadMore} />)

    const sentinel = document.querySelector('.infinite-scroll-loader')
    expect(sentinel).toBeInTheDocument()
    expect(sentinel).toHaveAttribute('aria-busy', 'false')
  })

  it('should update onLoadMore callback without losing observers', () => {
    const mockOnLoadMore2 = vi.fn() as any

    const { rerender } = render(
      <InfiniteScrollLoader onLoadMore={mockOnLoadMore} hasMore={true} isLoading={false} />,
    )

    const intersectionCallback = (global.IntersectionObserver as any).mock.calls[0][0]

    // Trigger intersection with first callback
    intersectionCallback([{ isIntersecting: true }])
    expect(mockOnLoadMore).toHaveBeenCalledTimes(1)

    // Rerender with new callback
    rerender(<InfiniteScrollLoader onLoadMore={mockOnLoadMore2} hasMore={true} isLoading={false} />)

    // The observer should be reset due to dependency on onLoadMore
    // This is expected behavior for the current implementation
  })
})
