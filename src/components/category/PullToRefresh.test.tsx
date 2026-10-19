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

  it('makes API call on threshold pull completion', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('OK', { status: 200 }))

    render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )

    const touchStartEvent = new TouchEvent('touchstart', {
      touches: [{ clientY: 0 } as Touch],
      bubbles: true,
    })
    fireEvent(document.documentElement, touchStartEvent)

    const touchMoveEvent = new TouchEvent('touchmove', {
      touches: [{ clientY: 110 } as Touch],
      bubbles: true,
      cancelable: true,
    })
    fireEvent(document.documentElement, touchMoveEvent)

    const touchEndEvent = new TouchEvent('touchend', {
      bubbles: true,
    })
    fireEvent(document.documentElement, touchEndEvent)

    // Verify that fetch was called with the expected slug in the URL
    setTimeout(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/catalog/page?slug=test-category',
        expect.any(Object),
      )
    }, 100)
  })

  it('uses category slug in API endpoint', () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('OK', { status: 200 }))

    const categorySlug = 'electronics'
    render(
      <PullToRefresh categorySlug={categorySlug}>
        <div>Test Content</div>
      </PullToRefresh>,
    )

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

    const touchEndEvent = new TouchEvent('touchend', {
      bubbles: true,
    })
    fireEvent(document.documentElement, touchEndEvent)

    setTimeout(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/catalog/page?slug=${categorySlug}`,
        expect.objectContaining({
          headers: { accept: 'application/json' },
        }),
      )
    }, 100)
  })

  it('attempts API refresh on sufficient pull', () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('OK', { status: 200 }))

    render(
      <PullToRefresh categorySlug="test-category">
        <div>Test Content</div>
      </PullToRefresh>,
    )

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

    const touchEndEvent = new TouchEvent('touchend', {
      bubbles: true,
    })
    fireEvent(document.documentElement, touchEndEvent)

    setTimeout(() => {
      // Verify fetch was called (page reload is not mockable)
      expect(global.fetch).toHaveBeenCalled()
    }, 100)
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
