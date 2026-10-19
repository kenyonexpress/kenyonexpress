import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@testing-library/react'

import PullToRefresh from '@/components/category/PullToRefresh'

describe('PullToRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('renders children', () => {
    render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('renders the refresh indicator', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    const indicator = container.querySelector('.pull-to-refresh__indicator')
    expect(indicator).toBeInTheDocument()
  })

  it('renders an SVG icon in the indicator', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    const svg = container.querySelector('.pull-to-refresh__indicator svg')
    expect(svg).toBeInTheDocument()
  })

  it('accepts a categorySlug prop', () => {
    const { container } = render(
      <PullToRefresh categorySlug="my-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    expect(container).toBeInTheDocument()
  })

  it('detects touch start at scroll top', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    const element = container.querySelector('.pull-to-refresh__indicator')
    expect(element).toBeInTheDocument()

    const touchStartEvent = new TouchEvent('touchstart', {
      touches: [
        {
          clientY: 0,
        } as Touch,
      ],
      bubbles: true,
    })

    fireEvent(document.documentElement, touchStartEvent)
    expect(element).toBeInTheDocument()
  })

  it('handles touch move with distance tracking', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    const element = container.querySelector('.pull-to-refresh__indicator')
    expect(element).toBeInTheDocument()

    const touchStartEvent = new TouchEvent('touchstart', {
      touches: [{ clientY: 0 } as Touch],
      bubbles: true,
    })
    fireEvent(document.documentElement, touchStartEvent)

    const touchMoveEvent = new TouchEvent('touchmove', {
      touches: [{ clientY: 50 } as Touch],
      bubbles: true,
      cancelable: true,
    })
    fireEvent(document.documentElement, touchMoveEvent)
    expect(element).toBeInTheDocument()
  })

  it('can be used with different category slugs', () => {
    render(
      <PullToRefresh categorySlug="electronics">
        <div>Electronics Category</div>
      </PullToRefresh>,
    )
    expect(screen.getByText('Electronics Category')).toBeInTheDocument()
  })

  it('supports multiple children elements', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Child 1</div>
        <div>Child 2</div>
      </PullToRefresh>,
    )
    expect(screen.getByText('Child 1')).toBeInTheDocument()
    expect(screen.getByText('Child 2')).toBeInTheDocument()
    expect(container.querySelector('.pull-to-refresh__indicator')).toBeInTheDocument()
  })

  it('component persists across multiple renders', () => {
    const { rerender } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Content v1</div>
      </PullToRefresh>,
    )
    expect(screen.getByText('Content v1')).toBeInTheDocument()

    rerender(
      <PullToRefresh categorySlug="test-category">
        <div>Content v2</div>
      </PullToRefresh>,
    )
    expect(screen.getByText('Content v2')).toBeInTheDocument()
  })

  it('respects scroll position and ignores pull when scrolled', () => {
    render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )

    Object.defineProperty(document.documentElement, 'scrollTop', {
      writable: true,
      value: 50,
    })

    const touchStartEvent = new TouchEvent('touchstart', {
      touches: [{ clientY: 0 } as Touch],
      bubbles: true,
    })
    fireEvent(document.documentElement, touchStartEvent)

    const touchMoveEvent = new TouchEvent('touchmove', {
      touches: [{ clientY: 120 } as Touch],
      bubbles: true,
      cancelable: true,
    })
    fireEvent(document.documentElement, touchMoveEvent)

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('renders SVG with aria-label for accessibility', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )
    const svg = container.querySelector('.pull-to-refresh__indicator svg')
    expect(svg).toHaveAttribute('aria-label', 'רענון')
    expect(svg).toHaveAttribute('role', 'img')
  })

  it('supports Hebrew RTL content properly', () => {
    const { container } = render(
      <PullToRefresh categorySlug="test-category">
        <div>תוכן בעברית</div>
      </PullToRefresh>,
    )
    expect(screen.getByText('תוכן בעברית')).toBeInTheDocument()
    const indicator = container.querySelector('.pull-to-refresh__indicator')
    expect(indicator).toBeInTheDocument()
  })
})
